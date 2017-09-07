https://github.com/mozilla/share-button-study

## Intro

Share-button-study as a template to improve shield study. Improve Shield Study Add-on Utils. Also worked on some control interfaces, Normandy recipe server (python + JavaScript). GitHub repo for Shield Utils; no one had used it (https://github.com/mozilla/shield-studies-addon-utils/); mostly working on bug fixes and functionality, not documentation.

This shield study is a bootstrapped extension (https://developer.mozilla.org/en-US/Add-ons/Bootstrapped_extensions).
Mark has written some scripts that add automated testing (CI) and an add-on runner (so you don’t have to start FF, load, etc.)

Note in the legacy add-on MDN documentation: “application” refers to Firefox

## How to Run the Study:

Note: This study has a min Firefox version of 55 and max Firefox version of 56, as FF 57 removed the Share button.
I have added these methods to an Anki flashcard called: “How to run Bootstrap Extensions in Firefox”
The Share Button Study has different branches or treatments, which will change how it behaves.
How do I make these changes and view the result?
https://developer.mozilla.org/en-US/Add-ons/Bootstrapped_extensions

Method 1:
* Go to `about:debugging` in Firefox.
* Click ‘Install Temporary Add-On’.
* Navigate to bdanforth/projects/share-button-study/extension
* Select `bootstrap.js` (or any file).

Method 2:
* In the project directory on the command line, type `npm build`; this makes an XPI file in the `extension` subfolder.
* Go to `about:debugging` in Firefox.
* Click ‘Install temporary add-on’
* Navigate to and select the XPI file.

Method 3: Recommended
Notes: Make sure Node is up-to-date, since async arrow functions are used
* Remove the carets in `package.json` for all dependencies and devDependencies as using the latest package version for some dependencies breaks the study.
* On the command line, enter `export FIREFOX_BINARY='/Applications/Firefox.app/Contents/MacOS/firefox' && npm run man`
* The first argument sets up the environment variable FIREFOX_BINARY in your bash .profile
* the second argument runs the `manual_test.js` script

# Share Button Study
The purpose of this extension is to visually highlight the share button in the browser toolbar when text from the URL bar is copied.

## Overview of extension
See [Bootstrapped extensions](https://developer.mozilla.org/en-US/Add-ons/Bootstrapped_extensions) for more information.

### bootstrap.js
MDN References [[1](https://developer.mozilla.org/en-US/docs/Extensions/bootstrap.js)] [[2](https://developer.mozilla.org/en-US/Add-ons/Bootstrapped_extensions#Bootstrap_entry_points)]

`startup()` 
1. Load the stylesheet for the share button animation.
2. Add the controller that detects the copy event in the URL bar.
3. Add an eventListener to the share button so that the CSS animation can be replayed.

`shutdown()`
1. Remove the CSS.
2. Remove the animation class from the share button.
3. Remove the controller from the URL bar.
4. Remove the eventListener from the share button.

### chrome.manifest
[MDN Reference](https://developer.mozilla.org/en-US/docs/Chrome_Registration)

This file is used to include resources (ie. share\_button.css). It associates "resource://share-button-study" with the current directory.

### install.rdf
[MDN Reference](https://developer.mozilla.org/en-US/Add-ons/Install_Manifests)

The install manifest includes information about the add-on such as the name, description, version number, etc.

### share_button.css
This file includes the animation that highlights the share button.
