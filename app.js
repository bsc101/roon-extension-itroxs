"use strict";

var nodeCleanup = require('node-cleanup');
const fs        = require('fs');
const path      = require("path");
const { fork }  = require('child_process');

var is_pkg = false;
var snapshot_basedir = '';
var child_proc = null;

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
    });
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

if (is_pkg)
{
    if (fs.existsSync('roon-extension-itroxs'))
    {
        rmdir('roon-extension-itroxs');
    }
    extract_snapshot('roon-extension-itroxs');
}

setTimeout(() => run_itroxs(), 1000);
