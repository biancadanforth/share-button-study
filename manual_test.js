// USE THIS FILE TO TEST DIFFERENT TREATMENTS IN DEVELOPMENT

/* eslint-env node */

// Install add-on, open firefox, apply treatment, then stop (automated tests do clicking, checking etc.)

/* This file is a helper script that will install the extension from the .xpi
 * file and setup useful preferences for debugging. This is the same setup
 * that the automated Selenium-Webdriver/Mocha tests run, except in this case
 * we can manually interact with the browser.
 * NOTE: If changes are made, they will not be reflected in the browser upon
 * reloading, as the .xpi file has not been recreated.
 */

 /*
 NOTES ABOUT TESTING MANUALLY USING MANUAL_TEST.JS VERSUS AUTOMATED TESTING USING SELENIUM WEBDRIVER
 To test different treatments, open manual_test.js

The testing framework and manual_test.js are separate but behave in similar ways.

Selenium webdriver allows you to programmatically automate browser, click things, execute scripts in browser etc. Install add on, open firefox, set treatment, check to see if treatment happens.

Manual testing script doesn’t do any tests for you but uses same way of setting up the browser, installing the add-on and testing the treatment from the Selenium webdriver testing framework. Installs add on, opens firefox, set treatment and then stops.

A lot of stuff in the browser relies on waiting for events to happen; you do something and 90% of the time the test works, 10% of the time there’s a timing issue/race condition.

 */

const utils = require("./test/utils");
const firefox = require("selenium-webdriver/firefox");

const Context = firefox.Context;

(async() => {
  try {
    // driver represents the firefox instance controlled by selenium
    const driver = await utils.promiseSetupDriver();
    // by default the share button is NOT in the toolbar; you can comment out this line to test
    // different treatments based on the absence of the button
    // may also be a utils.removeShareButton()
    // add the share-button to the toolbar
    await utils.addShareButton(driver);
    // set the treatment
    // This method executes arbitrary JS (running in a diff context) in context of browser
    // the last parameter, callback, is special, takes the value from the browser context and sets
    // that to be the return value of executeAsyncScrypt
    // we have one arg besides callback, but could pass an arbitrary number of arguments, last argument is a 
    // typeArg = doorhangerAskToAdd
    // say you have a FF window with multiple tabs open, say you want to get the webiste title for the 4th tab
    // say you have a method that gets this by the tab number
    await driver.executeAsyncScript((typeArg, callback) => {
      Components.utils.import("resource://gre/modules/Preferences.jsm");
      if (typeArg !== null) {
        Preferences.set("extensions.sharebuttonstudy.treatment", typeArg);
      }
      callback();
      // this is where you specify which treatment; if use 'null' it will not set the override preference
      // so will do the default weighted variation choosing
      // for treatments where the user initially doesn't have the share button, comment out
      // utils.addSharebutton above.
      // see the TREATMENTS const in bootstrap.js for all treatment keys
    }, "doorhangerAskToAdd");
    // install the addon
    // in webdriver, there's a special FF specific command that lets you install an addon
    // by providing a path to the XPI file. We read the environment variable XPI_NAME for this path
    // have to pass in the driver to utils, because it needs to know which instance of firefox to
    // send the commands to.
    await utils.installAddon(driver);

    // navigate to a regular page
    // Context changes between the chrome and the content, to navigate to a different page
    // you have to be in the Content context, to add share button you have to be in the chrome context
    driver.setContext(Context.CONTENT);
    await driver.get("http://github.com/mozilla");
    driver.setContext(Context.CHROME);
    // automated copy action; need to be in the Chrome context for this
    // focusing the URL bar as an HTML element; the location of the URL bar is within the browser chrome, not
    // within the document being displayed in the content context.
    await utils.copyUrlBar(driver);
    // sometimes webdriver messes up; it opens firefox but can't control firefox
    // the reason why you have a try/catch, is for async/await, might have an 
  } catch (e) {
    console.error(e); // eslint-disable-line no-console
  }
})();
