## Roon Extension for Android App it'roXs!

This extension is needed by the Android app **it'roXs**. It communicates with your Roon system and provides a server the Android app connects to.
You can find the app in the Google Play Store:
[it'roXs - eXtends your Roon music player](https://play.google.com/store/apps/details?id=com.bsc101.itroxs)

Main features of the **it'roXs** Android app:

   * Adds a media notification for a Roon output to the status bar and lock screen
   * Shows current title meta data on the lock screen
   * Controls the volume of a Roon output with the volume hardware buttons of your device (if the volume of the selected output can be controlled through Roon, of course)

## Installation (Method 1)

1. Install Node.js from https://nodejs.org

   * On Windows, install from the above link.
   * On Mac OS, you can use [homebrew](http://brew.sh) to install Node.js.
   * On Linux, you can use your distribution's package manager, but make sure it installs a recent Node.js. Otherwise just install from the above link.

2. Install Git from https://git-scm.com/downloads

   * Following the instructions for the Operating System you are running.

3. Clone or download this project

   * Preferred: Clone this project: 
     ```bash
     git clone https://github.com/bsc101/roon-extension-itroxs.git
     ```
   * Or: Go to the [roon-extension-itroxs](https://github.com/bsc101/roon-extension-itroxs) page on [GitHub](https://github.com).
   * Click the green 'Clone or Download' button and select 'Download ZIP'.
   * Extract the zip file in a local folder

4. Change directory into the extensions folder

    ```bash
    cd roon-extension-itroxs
    ```

5. Install the dependencies

    ```bash
    npm install
    ```

6. Run it!

    ```bash
    node .
    ```
    The extension should appear in Roon now. Go to Settings->Extensions and you should see it in the list. Enable the extension.

7. Extension settings

    This extension makes a server available to the app, the default listening port is 8090. You can change the port in the extension settings.
    You will have to enter the IP address and port of the server provided by this extension in the settings page of the **it'roXs** app.

## Installation (Method 2)

If you don't want to install anything (e.g. node, git, ...), but prefer to simply run a single executable file, then this is the way to go! You can find the latest version of this extension as executable file here (Windows, macOS, Linux):
[/itroxs/downloads/roon-extension-itroxs/latest](https://bsc101.eu/itroxs/downloads/roon-extension-itroxs/latest/)
Check the sha256 fingerprint after downloading the executable to verify the download is correct ([sha256 fingerprints](https://bsc101.eu/itroxs/downloads/roon-extension-itroxs/latest/sha256.txt)).

#### Windows

You can double-click the file *roon-extension-itroxs-win.exe* to run it. The file is not signed, so you will get warnings when you try to run the executable. If you want, check the file first with your virus scanner or an online scanner like [virustotal](https://www.virustotal.com/gui/home/upload). You can also run the file in a virtual machine.
Since this extension provides a server component, your firewall may popup. Make sure your firewall does not block incoming connections.

#### macOS

Download the file *roon-extension-itroxs-macos*. If Safari adds some file name extension, rename the file to *roon-extension-itroxs-macos*. Make the file executable:

    chmod a+x roon-extension-itroxs-macos

Open *Finder* and select *Open* from the context menu of the file. macOS also displays some warnings, ignore and run the file.

#### Linux

Make the file *roon-extension-itroxs-linux* executable after downloading: 

    chmod a+x roon-extension-itroxs-linux

Run the file in a terminal.

#### All platforms

After running the file, the extension should appear in Roon. Go to Roon -> Settings -> Extensions and enable it. Now the Android app should be able to connect to the extension (enter the IP address of the machine on which the extension is running in the apps settings).

## Firewall

Make sure the selected port (default is 8090) is not blocked by your firewall. If necessary, adjust your firewalls settings.

## Notes

* This extension (and the app) is in an early state and still under construction!
* If you have any questions, mailto: dev@bsc101.eu
