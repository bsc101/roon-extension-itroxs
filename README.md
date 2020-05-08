## Roon Extension for Android App it'roXs!

This extension is needed by the Android app it'roXs. You can find the app in the Google Play Store:
[it'roXs - eXtends your Roon music player](https://play.google.com/store/apps/details?id=com.bsc101.itroxs)

Main features of it'roXs:

   * Adds a media notification for a Roon output to the status bar and lock screen
   * Shows current title meta data on the lock screen
   * Controls the volume of a Roon output with the volume hardware buttons of your device

## Installation

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

7. Extension settings:

    This extension makes a server available to the app, the default listening port is 8090. You can change the port in the extension settings.
    You will have to enter the IP address and port of the server provided by this extension in the settings of the app.

## Firewall

Make sure the selected port (default is 8090) is not blocked by your firewall. If necessary, adjust your firewalls settings.

## Notes

* This extension (and the app) is in an early state and still under construction!
