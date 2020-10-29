"use strict";

var nodeCleanup = require('node-cleanup');
const fs        = require('fs');
const path      = require("path");
const { fork }  = require('child_process');
const https     = require('https');
const crypto    = require('crypto');

var is_pkg = false;
var snapshot_basedir = '';
var child_proc = null;

var ext_version = '1.0.8';
var ext_base_url = 'https://bsc101.eu/itroxs/downloads/roon-extension-itroxs/latest/';
var ext_latest_version_url = 'https://bsc101.eu/itroxs/downloads/roon-extension-itroxs/latest/version_info.json';
var ext_latest_version = {};

var check_updates = false;

init();

function debug(msg)
{
    console.log('#app[' + Date.now() + ']: ' + msg);
};

function init()
{
    process.argv.forEach(function (val, index, array)
    {
        debug(index + ': ' + val);
        if (index == 1)
        {
            var idx = val.indexOf('snapshot');
            if (idx > 0)
            {
                is_pkg = true;
                snapshot_basedir = val.substr(0, idx + 9);
                debug('snapshot_basedir: ' + snapshot_basedir);
            }
        }
        if (val == 'check_updates')
        {
            check_updates = true;
        }
    });
    debug(`check_updates = ${check_updates}`);
}

function run_itroxs()
{
    var now = Date.now();
    var itroxs_js = 'itroxs.js';
    if (is_pkg)
    {
        itroxs_js = 'roon-extension-itroxs/itroxs.js';
    }
    child_proc = fork(itroxs_js);
    child_proc.on('close', (code) =>
    {
        var uptime = Date.now() - now;
        debug(`child proc exited with code ${code}, uptime = ${uptime}`);
        var delay = 3000;
        if (uptime < 57000)
        {
            delay = 60000 - uptime;
        }
        if (code == 101) // restart
        {
            debug('restarting...');
            delay = 1000;
        }
        debug(`waiting ${delay} ms...`);
        setTimeout(() => run_itroxs(), delay);
        child_proc = null;
    });
}

nodeCleanup(function (exitCode, signal)
{
    debug("cleanup...");

    if (child_proc)
    {
        debug('terminating child proc...');
        child_proc.kill();
    }

    if (is_pkg)
    {
        if (fs.existsSync('roon-extension-itroxs'))
        {
            rmdir('roon-extension-itroxs');
        }
    }

    debug("cleanup... done");
});

var rmdir = function(dir)
{
    var list = fs.readdirSync(dir);
    for (var i = 0; i < list.length; i++)
    {
        var filename = path.join(dir, list[i]);
        var stat = fs.statSync(filename);

        if (filename == "." || filename == "..")
        {
            // pass these files
        }
        else if (stat.isDirectory())
        {
            // rmdir recursively
            rmdir(filename);
        }
        else
        {
            // rm filename
            fs.unlinkSync(filename);
        }
    }
    fs.rmdirSync(dir);
};

function extract_snapshot(dir)
{
    // debug('mkdir: ' + dir);
    fs.mkdirSync(dir);
    fs.readdirSync(snapshot_basedir + dir).forEach(file =>
    {
        // debug(file);
        if (fs.lstatSync(snapshot_basedir + dir + '/' + file).isDirectory())
        {
            extract_snapshot(dir + '/' + file);
        }
        else
        {
            var buf = fs.readFileSync(snapshot_basedir + dir + '/' + file);
            fs.writeFileSync(dir + '/' + file, buf);
        }
    });
}

function download_new_version()
{
    let exepath = process.argv[0];
    let exe = path.basename(exepath);
    debug('downloading file: ' + exe);
    let dest = path.join(path.dirname(exepath), exe + '.' + ext_latest_version.version);
    debug('dest = ' + dest);
    let file = fs.createWriteStream(dest);
    https.get(ext_base_url + exe, (resp) => 
    {
        resp.pipe(file);
        file.on('finish', () => 
        {
            file.close();

            let sizeExpected = ext_latest_version[exe].size; 
            let stat = fs.statSync(dest);
            debug('download finished: ' + stat.size + ' bytes, sizeExpected = ' + sizeExpected);

            if (stat.size == sizeExpected)
            {
                const hash = crypto.createHash('sha256');
                const input = fs.createReadStream(dest);
                input.on('data', function (chunk) 
                {
                    hash.update(chunk);
                });
                input.on('close', function () 
                {
                    let sha256 = hash.digest('hex');
                    debug('sha256 = ' + sha256);

                    if (sha256 == ext_latest_version[exe].sha256)
                    {
                        fs.chmodSync(dest, '775');

                        debug('renaming files...');
                        fs.renameSync(exepath, exepath + '.old');
                        fs.renameSync(dest, exepath);

                        process.exit(101);
                    }
                    else
                    {
                        debug('wrong hash!')
                    }
                });
            }
            else
            {
                debug('wrong download size!')
            }
        });
    }).on('error', (err) => 
    {
        file.close();
        debug('download error: ' + err)
        fs.unlink(dest);
    });
}

function check_update_available()
{
    https.get(ext_latest_version_url, (resp) =>
    {
        let data = '';
        resp.on('data', (chunk) => data += chunk);
        resp.on('end', () =>
        {
            // debug('data = ' + data);
            ext_latest_version = JSON.parse(data);
            debug('latest version: ' + ext_latest_version.version);

            if (ext_latest_version.version && ext_latest_version.version != ext_version)
            {
                debug('new version available')
                download_new_version();
            }
            else
            {
                debug('no new version')
            }
        });
    });

    setTimeout(() => check_update_available(), 900000);
}

if (is_pkg)
{
    if (fs.existsSync(process.argv[0] + '.old'))
    {
        fs.unlinkSync(process.argv[0] + '.old');
    }
    if (fs.existsSync('roon-extension-itroxs'))
    {
        rmdir('roon-extension-itroxs');
    }
    extract_snapshot('roon-extension-itroxs');

    if (check_updates)
    {
        setTimeout(() => check_update_available(), 15000);
    }
}

setTimeout(() => run_itroxs(), 1000);
