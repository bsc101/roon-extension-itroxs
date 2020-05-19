"use strict";

var RoonApi          = require('node-roon-api'),
    RoonApiSettings  = require('node-roon-api-settings'),
    RoonApiStatus    = require('node-roon-api-status'),
    RoonApiImage     = require('node-roon-api-image'),
    RoonApiBrowse    = require('node-roon-api-browse'),
    RoonApiTransport = require('node-roon-api-transport');

var debug            = require('debug')('it\'roXs!');
var nodeCleanup      = require('node-cleanup');

var http             = require("http");
var WebSocketServer  = require('websocket').server;

var service = {};
var roondata = {};

var instance = "";
var instance_display_name = "";

var ext_id      = 'com.bsc101.itroxs';
var ext_version = '0.4.1';

var subscribe_delay = 1000;
var subscribe_timer = null;

init();

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
    }
});

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

            data.zones.forEach(e => roondata.zone_ids.push(e.zone_id));
            debug("zone_ids = " + roondata.zone_ids.toString())

            updateZonesSeek();

            start_service();
        }
        else if (response == "Changed")
        {
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
                        roondata.zone_ids.push(e.zone_id)
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
                            if (Math.abs(z.seek_position - e.seek_position) > 1)
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
                let now = Date.now();
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
                        msgOut.zones.push(zone);
                    });
                }
                service.connections.forEach(c => c.sendUTF(JSON.stringify(msgOut)));
            }

            updateZonesSeek();
        }
    });
}

function updateZonesSeek()
{
    roondata.zones_seek = [];
    roondata.zone_ids.forEach(zid => 
    {
        let zone = roondata.transport.zone_by_zone_id(zid);
        if (zone == null) return;
        if (zone.now_playing == undefined) return;
        roondata.zones_seek.push({
            zone_id: zid,
            seek_position: zone.now_playing.seek_position,
            queue_time_remaining: zone.queue_time_remaining
        });
    });
}

var mysettings = roon.load_config("settings" + instance) || {
    port: "8090",
    id: Math.floor(Math.random() * 65536)
};

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
            if (!mysettings.id)
                mysettings.id = Math.floor(Math.random() * 65536);
            let _name = mysettings.displayname;
            let _id = mysettings.id;

            mysettings = l.values;
            mysettings.id = _name == mysettings.displayname ? _id : Math.floor(Math.random() * 65536);

            svc_settings.update_settings(l);
            roon.save_config("settings" + instance, mysettings);

            start_service();
        }
    }
});

var svc_status = new RoonApiStatus(roon);

roon.init_services({
    required_services: [ RoonApiTransport, RoonApiImage ],
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
                debug('instance = %s', instance);

                instance_display_name = " (" + inst + ")";
            }
        }
    });
}

function stop_service()
{
    if (service.keep_alive_timer)
    {
        clearTimeout(service.keep_alive_timer)
        service.keep_alive_timer = null;
    }

    if (service.server)
    {
        debug("stopping websocketserver...")

        service.wss.shutDown();
        service.wss = null;
        service.server.close();
        service.server = null;
        service.connections = null;

        debug("stopping websocketserver... done")
    }

    svc_status.set_status("Service Not Running", false);
}

function keep_alive()
{
    debug('keep_alive...');

    if (roondata && roondata.core && service.connections)
    {
        let now = Date.now();
        let msgOut = {
            command: 'zones_seek_changed',
            timestamp: now,
        };
        service.connections.forEach(c => c.sendUTF(JSON.stringify(msgOut)));

        service.keep_alive_timer = setTimeout(keep_alive, 10000);
    }
}

function start_service() 
{
    stop_service();

    if (!mysettings.port)
        return;

    // service.keep_alive_timer = setTimeout(keep_alive, 10000);

    debug('starting websocketserver...');

    service.connections = [];
    service.server = http.createServer(function(request, response) 
    {
        debug('received request for ' + request.url);
        response.writeHead(404);
        response.end();
    });
    service.server.listen(mysettings.port, function() 
    {
        debug('server is listening on port ' + mysettings.port);

        svc_status.set_status("Service Running", false);
    });
    service.wss = new WebSocketServer({
        httpServer: service.server,
        autoAcceptConnections: false
    });
    service.wss.on('request', function(request)
    {
        debug('WSS: request...');
        request.accept(null, request.origin);
    });
    service.wss.on('connect', function(conn)
    {
        debug('WSS: connect...');

        service.connections.push(conn);

        conn.on('message', function(message)
        {
            let msgIn = JSON.parse(message.utf8Data);
            handleMessageIn(conn, msgIn);
        });
        conn.on('close', function(reason, description)
        {
            debug('CONN: close...');
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

        let now = Date.now();
        let msgOut = {
            command: 'welcome',
            timestamp: now,
            extension_id: ext_id + instance,
            version: ext_version,
            zones: []
        };
        if (roondata.zone_ids)
        {
            // debug("zone_ids = " + roondata.zone_ids.toString())
            roondata.zone_ids.forEach(zid => 
            {
                let zone = roondata.transport.zone_by_zone_id(zid);
                zone.timestamp = now;
                msgOut.zones.push(zone);
            });
        }
        conn.sendUTF(JSON.stringify(msgOut));
    });

    debug('starting websocketserver... done');
}

function handleMessageIn(conn, msgIn)
{
    debug('handleMessageIn: msgIn = ' + JSON.stringify(msgIn));

    switch (msgIn.command)
    {
        case "get_image":
            let size = msgIn.image_size || 256;
            roondata.image.get_image(msgIn.image_key, { scale: "fit", width: size, height: size, format: "image/jpeg" }, function(msg, contentType, body)
            {
                let msgOut = {
                    command: 'set_image',
                    timestamp: Date.now(),
                    image: {
                        image_key: msgIn.image_key,
                        content_type: contentType,
                        body: body
                    }
                };
                conn.sendUTF(JSON.stringify(msgOut));
            });
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
    
        case "get_zone":
            let now = Date.now();
            let msgOut = {
                command: 'zones_changed',
                timestamp: now,
                zones: []
            };
            let zone = roondata.transport.zone_by_zone_id(msgIn.zone_id);
            if (zone)
            {
                zone.timestamp = now;
                msgOut.zones.push(zone);
            }
            conn.sendUTF(JSON.stringify(msgOut));
            break;

        case "change_settings":
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
