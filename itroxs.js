"use strict";

var RoonApi          = require('node-roon-api'),
    RoonApiSettings  = require('node-roon-api-settings'),
    RoonApiStatus    = require('node-roon-api-status'),
    RoonApiImage     = require('node-roon-api-image'),
    RoonApiBrowse    = require('node-roon-api-browse'),
    RoonApiTransport = require('node-roon-api-transport');

var nodeCleanup      = require('node-cleanup');
var WebSocket        = require('ws');
var https            = require('https');
const { Buffer }     = require('buffer');
const fs             = require('fs');

var service = {};
var roondata = {};

var radioparadise = {
    mainmix: {
        channel: 'main',
        title: '[RP Main Mix]',
        url: 'https://api.radioparadise.com/api/now_playing?chan=0',
        image_key_prefix: 'radioparadise.mainmix.'
    },
    mellowmix: {
        channel: 'mellow',
        title: '[RP Mellow Mix]',
        url: 'https://api.radioparadise.com/api/now_playing?chan=1',
        image_key_prefix: 'radioparadise.mellowmix.'
    },
    rockmix: {
        channel: 'rock',
        title: '[RP Rock Mix]',
        url: 'https://api.radioparadise.com/api/now_playing?chan=2',
        image_key_prefix: 'radioparadise.rockmix.'
    },
    worldmix: {
        channel: 'world',
        title: '[RP World/Etc Mix]',
        url: 'https://api.radioparadise.com/api/now_playing?chan=3',
        image_key_prefix: 'radioparadise.worldmix.'
    }
};

var instance = "";
var instance_display_name = "";

var ext_id      = 'com.bsc101.itroxs';
var ext_version = '1.0.5';

var subscribe_delay = 1000;
var subscribe_timer = null;

var max_queue_items = 500;

init();

function debug(msg)
{
    console.log('#ext[' + Date.now() + ']: ' + msg);
};

process.on('uncaughtException', (err) => 
{
    debug('UncaughtException:');
    debug(err.stack);

    let ex = 
    {
        timestamp: Date.now(),
        stack: err.stack
    };
    fs.writeFileSync('exception.txt', JSON.stringify(ex));

    process.exit(1) //mandatory (as per the Node docs)
});

var roon = new RoonApi({
    extension_id:        ext_id + instance,
    display_name:        "Extension for Android App it'roXs!" + instance_display_name,
    display_version:     ext_version,
    publisher:           'Boris Schaedler',
    email:               'dev@bsc101.eu',
    website:             'https://github.com/bsc101/roon-extension-itroxs',
    set_persisted_state: function(state)
    {
        this.save_config("roonstate" + instance, state);
    },
    get_persisted_state: function()
    {
        return this.load_config("roonstate" + instance) || {};
    },
    core_paired: function(core) 
    {
        debug("core_paired...");

        roondata.core = core;
        roondata.browse = core.services.RoonApiBrowse;
        roondata.transport = core.services.RoonApiTransport;
        roondata.image = core.services.RoonApiImage;

        subscribe_timer = setTimeout(() => 
        {
            subscribe_zones();
        }, subscribe_delay);
    },
    core_unpaired: function(core) 
    {
        debug("core_unpaired...");

        if (subscribe_timer)
        {
            clearTimeout(subscribe_timer);
            subscribe_timer = null;
        }

        roondata = {};
        subscribe_delay = 12000;

        stop_service();

        process.exit(100);
    }
});

function queue_callback(_zone_id, response, data)
{
    debug('Q[' + _zone_id + ']: response = ' + response);
    // debug('Q: data = ' + JSON.stringify(data));

    if (response == "Subscribed")
    {
        roondata.queues.push({
            zone_id: _zone_id,
            items: data.items
        });
    }
    else if (response == "Changed")
    {
        roondata.queues.forEach(q => 
        {
            if (q.zone_id == _zone_id)
            {
                data.changes.forEach(c => 
                {
                    debug('Q[' + _zone_id + ']: operation = ' + c.operation);

                    if (c.operation == "remove")
                    {
                        debug('Q[' + _zone_id + ']: remove: index = ' + c.index + ', count = ' + c.count);
                        q.items.splice(c.index, c.count);
                        debug('Q[' + _zone_id + ']: remove> q.items.length = ' + q.items.length);
                    }
                    else if (c.operation == "insert")
                    {
                        debug('Q[' + _zone_id + ']: insert: index = ' + c.index + ', items.length = ' + c.items.length);
                        q.items.splice(c.index, 0, ...c.items);
                        debug('Q[' + _zone_id + ']: insert> q.items.length = ' + q.items.length);
                    }
                });
                let msgOut = {
                    command: 'queue_changed',
                    timestamp: Date.now(),
                    queue_zone_id: _zone_id,
                    max_queue_items: max_queue_items
                };
                service.connections.forEach(c => c.send(JSON.stringify(msgOut)));
            }
        });
    }
}

function subscribe_zones()
{
    if (!roondata.transport) return;

    subscribe_timer = null;

    roondata.transport.subscribe_zones(function(response, data)
    {
        debug("response = " + response);

        if (response == "Subscribed") 
        {
            roondata.zone_ids = [];
            roondata.zones_seek = [];
            roondata.queues = [];
            roondata.queue_zone_ids = [];
            roondata.output_data = [];

            data.zones.forEach(e => roondata.zone_ids.push(e.zone_id));
            debug("zone_ids = " + roondata.zone_ids.toString())

            update_zones_seek();

            data.zones.forEach(e => 
            {
                roondata.transport.subscribe_queue(e.zone_id, max_queue_items, function(r, d)
                {
                    queue_callback(e.zone_id, r, d);
                });
                roondata.queue_zone_ids.push(e.zone_id);
            });

            start_service();
        }
        else if (response == "Changed")
        {
            let now = Date.now();
            let send = false;

            if (data.zones_changed)
            {
                send = true;
            }

            if (data.zones_added)
            {
                send = true;
                data.zones_added.forEach(e => 
                {
                    if (!roondata.zone_ids.includes(e.zone_id))
                    {
                        roondata.zone_ids.push(e.zone_id)
                    }
                    if (!roondata.queue_zone_ids.includes(e.zone_id))
                    {
                        roondata.transport.subscribe_queue(e.zone_id, max_queue_items, function(r, d)
                        {
                            queue_callback(e.zone_id, r, d);
                        });
                        roondata.queue_zone_ids.push(e.zone_id);
                    }
                });
            }

            if (data.zones_removed)
            {
                send = true;
                data.zones_removed.forEach(zid => 
                {
                    let idx = roondata.zone_ids.indexOf(zid);
                    debug('removing zone: idx = ' + idx + ', zone_id = ' + zid);
                    if (idx >= 0)
                    {
                        roondata.zone_ids.splice(idx, 1);
                    }
                });
            }

            if (data.zones_seek_changed && !data.zones_changed)
            {
                data.zones_seek_changed.forEach(z => 
                {
                    roondata.zones_seek.forEach(e => 
                    {
                        if (e.zone_id == z.zone_id)
                        {
                            if ((Math.abs(z.seek_position - e.seek_position) > 1) ||
                                (Math.abs(now - e.timestamp) >= 1500))
                            {
                                debug('zone_id:  ' + e.zone_id);
                                debug('seek_pos: ' + e.seek_position + ' -> ' + z.seek_position);
                                send = true;
                            }
                        }
                    });
                });
            }

            if (send)
            {
                let msgOut = {
                    command: 'zones_changed',
                    timestamp: now,
                    zones: [],
                    zones_removed: data.zones_removed
                };
                if (roondata.zone_ids)
                {
                    roondata.zone_ids.forEach(zid => 
                    {
                        let zone = roondata.transport.zone_by_zone_id(zid);
                        zone.timestamp = now;
                        apply_additional_zone_data(zone);
                        msgOut.zones.push(zone);
                    });
                }
                service.connections.forEach(c => c.send(JSON.stringify(msgOut)));
            }

            update_zones_seek();
        }
    });
}

function zone_by_output_id(output_id)
{
    for (var zone_id of roondata.zone_ids)
    {
        let zone = roondata.transport.zone_by_zone_id(zone_id);
        for (var o of zone.outputs)
        {
            if (o.output_id == output_id)
                return zone;
        }
    }
    return null;
}

function check_timer(zone_id)
{
    let zone = roondata.transport.zone_by_zone_id(zone_id);
    if (zone.outputs)
    {
        let now = Date.now();
        zone.outputs.forEach(o => 
        {
            roondata.output_data.forEach(odata => 
            {
                if (odata.output_id == o.output_id)
                {
                    if (odata.sleep_timer && odata.sleep_timer.time > 0 && now > odata.sleep_timer.time && (now - odata.sleep_timer.time) < 5000)
                    {
                        debug('>>> sleep timer: output_id = ' + odata.output_id);
                        debug('>>> sleep timer: standby = ' + odata.sleep_timer.standby);
                        debug('>>> sleep timer: fadeout = ' + odata.sleep_timer.fadeout);

                        odata.sleep_timer.time = -odata.sleep_timer.time;
                        sleep(odata.output_id, odata.sleep_timer.standby, odata.sleep_timer.fadeout, 0);
                    }
                }
            });
        });
    }
}

function sleep(output_id, standby, fadeout, counter)
{
    let cancel = false;
    roondata.output_data.forEach(odata => 
    {
        if (odata.output_id == output_id)
        {
            if (odata.sleep_timer && odata.sleep_timer.time == 0)
                cancel = true;
        }
    });
    if (cancel)
        return;

    if (fadeout && counter < 75)
    {
        let zone = zone_by_output_id(output_id);
        if (zone.outputs)
        {
            if (counter > 0)
            {
                zone.outputs.forEach(o => 
                {
                    roondata.transport.change_volume(o.output_id, 'relative', -1);
                });
            }
            setTimeout(() => 
            {
                sleep(output_id, standby, fadeout, counter + 1);
            }, 400);
            return;
        }
    }

    setTimeout(() => 
    {
        let zone = zone_by_output_id(output_id);
        roondata.transport.control(zone.zone_id, "pause");
        if (standby && zone.outputs)
        {
            zone.outputs.forEach(o => 
            {
                roondata.transport.standby(o.output_id, {});
            });
        }
    }, 100);
}

function update_zones_seek()
{
    let now = Date.now();
    roondata.zones_seek = [];
    roondata.zone_ids.forEach(zid => 
    {
        let zone = roondata.transport.zone_by_zone_id(zid);
        if (zone == null) return;
        if (zone.now_playing == undefined) return;
        roondata.zones_seek.push({
            timestamp: now,
            zone_id: zid,
            seek_position: zone.now_playing.seek_position,
            queue_time_remaining: zone.queue_time_remaining
        });
    });
}

var mysettings = roon.load_config("settings" + instance) || {
    port: "8090",
    radio_paradise: true
};
if (typeof(mysettings.radio_paradise) === 'undefined')
{
    mysettings.radio_paradise = true;
}

function make_layout(settings) {
    var l = {
        values:    settings,
        layout:    [],
        has_error: false
    };

    l.layout.push({
        type:      "string",
        title:     "Port",
        subtitle:  "This extensions server listening port (e.g. 8090)",
        maxlength: 5,
        setting:   "port"
    });
    l.layout.push({
        type:      "dropdown",
        title:     "Radio Paradise",
        subtitle:  "Enable Radio Paradise metadata handling",
        values:  [
            { title: "Yes", value: true },
            { title: "No",   value: false  }
        ],
        setting:   "radio_paradise"
    });

    return l;
}

var svc_settings = new RoonApiSettings(roon, {
    get_settings: function(cb) 
    {
        cb(make_layout(mysettings));
    },
    save_settings: function(req, isdryrun, settings) 
    {
        let l = make_layout(settings.values);
        req.send_complete(l.has_error ? "NotValid" : "Success", { settings: l });

        if (!isdryrun && !l.has_error) 
        {
            mysettings = l.values;

            svc_settings.update_settings(l);
            roon.save_config("settings" + instance, mysettings);

            start_service();
        }
    }
});

var svc_status = new RoonApiStatus(roon);

roon.init_services({
    required_services: [ RoonApiTransport, RoonApiImage, RoonApiBrowse ],
    provided_services: [ svc_status, svc_settings ]
});

function init()
{
    process.argv.forEach(function (val, index, array)
    {
        debug(index + ': ' + val);

        if (val.startsWith("-inst:"))
        {
            var inst = val.substr(6);
            if (inst)
            {
                instance = "." + inst;
                // debug('instance = %s', instance);

                instance_display_name = " (" + inst + ")";
            }
        }
    });
}

function stop_service()
{
    if (service.check_things_timer)
    {
        clearTimeout(service.check_things_timer);
        service.check_things_timer = null;
    }
    if (service.keep_alive_timer)
    {
        clearTimeout(service.keep_alive_timer)
        service.keep_alive_timer = null;
    }

    if (service.wss)
    {
        debug("stopping websocketserver...")

        service.wss.close();
        service.wss = null;
        service.connections = null;

        debug("stopping websocketserver... done")
    }

    svc_status.set_status("Service Not Running", false);
}

function keep_alive()
{
    // debug('keep_alive...');

    if (roondata && roondata.core && service.connections)
    {
        let now = Date.now();
        let msgOut = {
            command: 'zones_seek_changed',
            timestamp: now,
        };
        service.connections.forEach(c => c.send(JSON.stringify(msgOut)));

        service.keep_alive_timer = setTimeout(keep_alive, 10000);
    }
}

function is_line_radioparadise(line, channel)
{
    let rp = false;
    if (line)
    {
        rp = 
            (line.toLowerCase().search('radio paradise') >= 0) &&
            (line.toLowerCase().search(channel) >= 0) ||
            (line.toLowerCase().search('rp ' + channel) >= 0);
    }
    return rp;
}

function is_radioparadise(zone, channel)
{
    if (!mysettings.radio_paradise)
        return false;

    if (zone.now_playing)
    {
        if (zone.now_playing.one_line && 
            is_line_radioparadise(zone.now_playing.one_line.line1, channel))
        {
            return true;
        }
        if (zone.now_playing.two_line && (
            is_line_radioparadise(zone.now_playing.two_line.line1, channel) || 
            is_line_radioparadise(zone.now_playing.two_line.line2, channel)))
        {
            return true;
        }
        if (zone.now_playing.three_line && (
            is_line_radioparadise(zone.now_playing.three_line.line1, channel) || 
            is_line_radioparadise(zone.now_playing.three_line.line2, channel) || 
            is_line_radioparadise(zone.now_playing.three_line.line3, channel)))
        {
            return true;
        }
    }

    return false;
}

function update_radioparadise_zones(channel)
{
    let now = Date.now();
    let msgOut = {
        command: 'zones_changed',
        timestamp: now,
        zones: []
    };
    if (roondata.zone_ids)
    {
        roondata.zone_ids.forEach(zid => 
        {
            let zone = roondata.transport.zone_by_zone_id(zid);
            if (is_radioparadise(zone, channel))
            {
                zone.timestamp = now;
                apply_additional_zone_data(zone);
                msgOut.zones.push(zone);
            }
        });
    }
    service.connections.forEach(c => c.send(JSON.stringify(msgOut)));
}

function check_radioparadise(rp)
{
    let now = Date.now();
    let do_request = false;
    if (!rp.now_playing && !rp.last_request)
    {
        do_request = true;
    }
    else if (rp.next_request)
    {
        if (now >= rp.next_request && now >= rp.last_request+3000)
        {
            do_request = true;
        }
    }
    if (do_request)
    {
        rp.last_request = now;

        https.get(rp.url, (resp) => 
        {
            let data = '';
            resp.on('data', (chunk) => data += chunk);
            resp.on('end', () => 
            {
                if (resp.statusCode == 200)
                {
                    debug(rp.title + ' data = ' + data);
                    rp.now_playing = JSON.parse(data);
                    rp.next_request = now + (rp.now_playing.time+2) * 1000;
    
                    https.get(rp.now_playing.cover, (resp) => 
                    {
                        let body = [];
                        resp.on('data', (chunk) => body.push(chunk));
                        resp.on('end', () => 
                        {
                            if (resp.statusCode == 200)
                            {
                                let image = Buffer.concat(body);
                                debug('image.length = ' + image.length);
                                rp.now_playing.image = image;
                                update_radioparadise_zones(rp.channel);
                            }
                            else
                            {
                                debug('resp.statusCode = ' + resp.statusCode);
                                rp.now_playing.image = null;
                                update_radioparadise_zones(rp.channel);
                            }
                        });
                    }).on("error", (err) => 
                    {
                        rp.now_playing.image = null;
                        update_radioparadise_zones(rp.channel);
                    });
                }
                else
                {
                    rp.now_playing = null;
                }
            });
        }).on("error", (err) => 
        {
            rp.now_playing = null;
        });
    }
}

function check_things()
{
    if (roondata.transport && roondata.zone_ids)
    {
        roondata.zone_ids.forEach(zone_id => check_timer(zone_id));
    }

    check_radioparadise(radioparadise.mainmix);
    check_radioparadise(radioparadise.mellowmix);
    check_radioparadise(radioparadise.rockmix);
    check_radioparadise(radioparadise.worldmix);

    service.check_things_timer = setTimeout(check_things, 1000);
}

function start_service() 
{
    stop_service();

    if (!mysettings.port)
        return;

    service.check_things_timer = setTimeout(check_things, 1000);
    // service.keep_alive_timer = setTimeout(keep_alive, 10000);

    debug('starting websocketserver...');

    service.connections = [];

    service.wss = new WebSocket.Server({ port: mysettings.port });

    service.wss.on('connection', (conn) => 
    {
        debug('WSS: connect...');

        service.connections.push(conn);

        conn.on('message', (message) => 
        {
            debug('WS: received: ' + message);

            let msgIn = JSON.parse(message);
            handle_message_in(conn, msgIn);
        });
        conn.on('close', () => 
        {
            debug('WS: close...');
            if (service.connections)
            {
                debug('connections.length = ' + service.connections.length);
                var idx = service.connections.indexOf(conn);
                debug('idx = ' + idx);
                if (idx >= 0)
                {
                    service.connections.splice(idx, 1);
                }
                debug('connections.length = ' + service.connections.length);
            }
        });

        let ex = {};
        if (fs.existsSync('exception.txt'))
        {
            var jex = fs.readFileSync('exception.txt').toString();
            ex = JSON.parse(jex);
        }

        let now = Date.now();
        let msgOut = {
            command: 'welcome',
            timestamp: now,
            extension_id: ext_id + instance,
            version: ext_version,
            exception: ex,
            zones: []
        };
        if (roondata.zone_ids)
        {
            roondata.zone_ids.forEach(zid => 
            {
                let zone = roondata.transport.zone_by_zone_id(zid);
                zone.timestamp = now;
                apply_additional_zone_data(zone);
                msgOut.zones.push(zone);
            });
        }
        conn.send(JSON.stringify(msgOut));
    });

    svc_status.set_status("Service Running", false);

    debug('starting websocketserver... done');
}

function apply_radioparadise_to_zone(zone, rp)
{
    if (is_radioparadise(zone, rp.channel))
    {
        if (rp.now_playing)
        {
            zone.now_playing.one_line.line1 = rp.now_playing.title + '\n' + rp.title;
    
            zone.now_playing.two_line.line1 = rp.now_playing.title;
            zone.now_playing.two_line.line2 = rp.now_playing.artist + '\n' + rp.title;
    
            zone.now_playing.three_line.line1 = rp.now_playing.title;
            zone.now_playing.three_line.line2 = rp.now_playing.artist;
            zone.now_playing.three_line.line3 = rp.now_playing.album + ' (' + rp.now_playing.year + ')' + '\n' + rp.title;

            if (!zone.now_playing.image_key.startsWith(rp.image_key_prefix))
            {
                rp.image_key = zone.now_playing.image_key;
                debug('rp.image_key = ' + rp.image_key);
            }

            if (rp.now_playing.image)
            {
                zone.now_playing.image_key = rp.image_key_prefix + rp.now_playing.cover;
            }
        }
    }
}

function apply_additional_zone_data(zone)
{
    if (zone.now_playing)
    {
        apply_radioparadise_to_zone(zone, radioparadise.mainmix);
        apply_radioparadise_to_zone(zone, radioparadise.mellowmix);
        apply_radioparadise_to_zone(zone, radioparadise.rockmix);
        apply_radioparadise_to_zone(zone, radioparadise.worldmix);
    }

    if (!zone.outputs)
    {
        return;
    }
    
    zone.outputs.forEach(o => 
    {
        o.sleep_timer = {
            time: 0,
            standby: false,
            fadeout: false
        };

        roondata.output_data.forEach(odata =>
        {
            if (odata.output_id == o.output_id)
            {
                if (odata.sleep_timer)
                {
                    o.sleep_timer = odata.sleep_timer;
                }
            }
        });
    });
}

function get_image_radioparadise(msgIn, rp)
{
    if (msgIn.image_key.startsWith(rp.image_key_prefix))
    {
        msgIn.image_key = rp.image_key;
        if (rp.now_playing && rp.now_playing.image)
            return rp.now_playing.image;
    }

    return null;
}

function get_image_radio(msgIn)
{
    let image = get_image_radioparadise(msgIn, radioparadise.mainmix);
    if (image)
        return image;

    image = get_image_radioparadise(msgIn, radioparadise.mellowmix);
    if (image)
        return image;

    image = get_image_radioparadise(msgIn, radioparadise.rockmix);
    if (image)
        return image;
            
    image = get_image_radioparadise(msgIn, radioparadise.worldmix);
    if (image)
        return image;
    
    return null;
}

function handle_message_in(conn, msgIn)
{
    switch (msgIn.command)
    {
        case "get_image":
            {
                let image_key = msgIn.image_key;
                let unscaled = get_image_radio(msgIn);

                let size = msgIn.image_size || 256;
                roondata.image.get_image(msgIn.image_key, { scale: "fit", width: size, height: size, format: "image/jpeg" }, function(msg, contentType, body)
                {
                    let msgOut = {
                        command: 'set_image',
                        timestamp: Date.now(),
                        image: {
                            image_key: image_key,
                            content_type: contentType,
                            body: body,
                            unscaled: unscaled,
                            image_tag: msgIn.image_tag
                        }
                    };
                    conn.send(JSON.stringify(msgOut));
                });
            }
            break;

        case "set_volumes":
            msgIn.set_volumes.forEach(e => 
            {
                if (e.absolute)
                {
                    roondata.transport.change_volume(e.output_id, 'absolute', e.value);
                }
                else if (e.value == +1 || e.value == -1)
                {
                    roondata.transport.change_volume(e.output_id, 'relative', e.value);
                }
            });
            break;

        case "set_volume":
            msgIn.set_volumes.forEach(e => 
            {
                roondata.transport.change_volume(e.output_id, 'absolute', e.value);
            });
            break;

        case "set_timer":
            {
                if (msgIn.sleep_timer)
                {
                    debug('set_timer: output_id = ' + msgIn.output_id);
                    debug('set_timer: sleep_timer.time    = ' + msgIn.sleep_timer.time);
                    debug('set_timer: sleep_timer.standby = ' + msgIn.sleep_timer.standby);
                    debug('set_timer: sleep_timer.fadeout = ' + msgIn.sleep_timer.fadeout);
                    let found = false;
                    roondata.output_data.forEach(o =>
                    {
                        if (o.output_id == msgIn.output_id)
                        {
                            o.sleep_timer = msgIn.sleep_timer;
                            found = true;
                        }
                    });
                    if (!found)
                    {
                        roondata.output_data.push({
                            output_id: msgIn.output_id,
                            sleep_timer: msgIn.sleep_timer
                        });
                    }
                    if (service.connections)
                    {
                        let msgOut = {
                            command: 'zones_changed',
                            timestamp: Date.now(),
                            zones: []
                        };
                        let zone = zone_by_output_id(msgIn.output_id);
                        if (zone)
                        {
                            zone.timestamp = Date.now();
                            apply_additional_zone_data(zone);
                            msgOut.zones.push(zone);
                        }
                        service.connections.forEach(c => c.send(JSON.stringify(msgOut)));
                    }
                }
            }
            break;
    
        case "get_zone":
            {
                let msgOut = {
                    command: 'zones_changed',
                    timestamp: Date.now(),
                    zones: []
                };
                let zone = roondata.transport.zone_by_zone_id(msgIn.zone_id);
                if (zone)
                {
                    zone.timestamp = Date.now();
                    apply_additional_zone_data(zone);
                    msgOut.zones.push(zone);
                }
                conn.send(JSON.stringify(msgOut));
            }
            break;

        case "get_queue":
            {
                let msgOut = {
                    command: 'queue_changed',
                    timestamp: Date.now(),
                    queue_zone_id: msgIn.zone_id,
                    max_queue_items: max_queue_items,
                    queue_items: []
                };
                roondata.queues.forEach(q => 
                {
                    if (q.zone_id == msgIn.zone_id)
                    {
                        msgOut.queue_items = q.items;
                    }
                });
                conn.send(JSON.stringify(msgOut));
            }
            break;

        case "play_from_here":
            {
                roondata.transport.play_from_here(msgIn.zone_id, msgIn.queue_item_id);
            }
            break;

        case "keep_alive":
            {
                let msgOut = {
                    command: 'keep_alive',
                    timestamp: Date.now(),
                };
                conn.send(JSON.stringify(msgOut));
            }
            break;

        case "change_settings":
            {
                let settings = {};
                if (msgIn.settings_shuffle)
                {
                    settings.shuffle = msgIn.settings_shuffle.shuffle;
                }
                if (msgIn.settings_loop)
                {
                    settings.loop = msgIn.settings_loop.loop;
                }
                if (msgIn.settings_radio)
                {
                    settings.auto_radio = msgIn.settings_radio.auto_radio;
                }
                roondata.transport.change_settings(msgIn.zone_id, settings);
            }
            break;

        case "play":
            roondata.transport.control(msgIn.zone_id, "play");
            break;

        case "pause":
            roondata.transport.control(msgIn.zone_id, "pause");
            break;

        case "next":
            roondata.transport.control(msgIn.zone_id, "next");
            break;

        case "prev":
            roondata.transport.control(msgIn.zone_id, "previous");
            break;

        case "standby":
            roondata.transport.standby(msgIn.output_id, {});
            break;
    }
}

nodeCleanup(function (exitCode, signal)
{
    debug("cleanup...");
    debug("cleanup... done");
});

roon.start_discovery();
