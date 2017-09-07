/* eslint-env node */
// The geckodriver package downloads and installs geckodriver for us.
// We use it by requiring it.

// Selenium can install the add-on for you, so you don't have to open about:debugging, etc.
// Selenium lets you set the treatment
// The point of the preference override is during testing you can set the preference explicitly
// Have a script that sets the pref for you, instead of going to about:config, updating the pref etc.
// Selenium implements a protocol called webdriver; this is a protocol that tells the browser to execute a command
// it works by sending HTTP requests to some server that knows how to execute the requests
// geckodriver translates webdriver commands into FF specific commands
// Give a command to selenium webdriver, send it to geckodriver which translates into something FF understands
require("geckodriver");
// cmd API for Selenium webdriver
const cmd = require("selenium-webdriver/lib/command");
// Firefox specific API for Selenium webdriver
const firefox = require("selenium-webdriver/firefox");
// File system; you can take screenshots in selenium and need to store it somewhere
// The tests were failing on the CI platform we were using; since that's run in a Docker image on a server somewhere
// it's hard to see what's going on, so Marc thought of taking screenshots
// animations and popups weren't working just having a screenshot wasn't super useful
// if changing the look of a site, then screenshots make sense
// In CI environment where there is no display this could be useful.
// Not actually used here.
const Fs = require("fs-extra");
// Does something with setting up the binary path; look up
// Some of this stuff is coming from an example web extension by standard8
// https://github.com/Standard8/example-webextension
const FxRunnerUtils = require("fx-runner/lib/utils");
// For screenshots, you have to make a local to an absolute path or something like that, for file handling
const path = require("path");
const webdriver = require("selenium-webdriver");

// Selenium webdriver things, methods for doing specific kinds of automation
// By is a locator so you can say: locate elements by ID for example
// The Selenium webdriver has documentation: https://seleniumhq.github.io/docs/
const By = webdriver.By;
const Context = firefox.Context;
const until = webdriver.until;

// These are certain things you can set in FF that we want to make sure are true
// These are applied to the user profile
// see promiseSetUpDriver function
// Selenium is not just for FF. It's general for all browsers.
// Note: Geckodriver already has quite a good set of default preferences
// for disabling various items.
// https://github.com/mozilla/geckodriver/blob/master/src/marionette.rs
const FIREFOX_PREFERENCES = {
  // see standard8 example web extension repo.
  // This will soon be a default.
  // Important to test with it working.
  // Ensure e10s is turned on.
  "browser.tabs.remote.autostart": true,
  "browser.tabs.remote.autostart.1": true,
  "browser.tabs.remote.autostart.2": true,
  // These are good to have set up if you're debugging tests with the browser
  // toolbox.
  // These are the same toggles for inspecting browser chrome
  // for Manual Testing not Automated testing via Selenium Web Driver
  "devtools.chrome.enabled": true,
  "devtools.debugger.remote-enabled": true,
};

// useful if we need to test on a specific version of Firefox
// say you want to use the beta or nightly binary
// apply path and filesystem things to it so Selenium can undesrtand it.
// see promiseSetupDriver method
async function promiseActualBinary(binary) {
  try {
    const normalizedBinary = await FxRunnerUtils.normalizeBinary(binary);
    await Fs.stat(normalizedBinary);
    return normalizedBinary;
  } catch (ex) {
    if (ex.code === "ENOENT") {
      throw new Error(`Could not find ${binary}`);
    }
    throw ex;
  }
}

// Selenium is also responsible for opening FF application
module.exports.promiseSetupDriver = async() => {
  const profile = new firefox.Profile();

  Object.keys(FIREFOX_PREFERENCES).forEach((key) => {
    profile.setPreference(key, FIREFOX_PREFERENCES[key]);
  });

  const options = new firefox.Options();
  options.setProfile(profile);

  const builder = new webdriver.Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(options);

  const binaryLocation = await promiseActualBinary(process.env.FIREFOX_BINARY || "firefox");
  await options.setBinary(new firefox.Binary(binaryLocation));
  const driver = await builder.build();
  driver.setContext(Context.CHROME);
  return driver;
};

module.exports.addShareButton = async driver =>
  driver.executeAsyncScript((callback) => {
    // see https://dxr.mozilla.org/mozilla-central/rev/211d4dd61025c0a40caea7a54c9066e051bdde8c/browser/base/content/browser-social.js#193
    Components.utils.import("resource:///modules/CustomizableUI.jsm");
    CustomizableUI.addWidgetToArea("social-share-button", CustomizableUI.AREA_NAVBAR);
    callback();
  });

module.exports.removeShareButton = async(driver) => {
  try {
    // wait for the animation to end before running subsequent tests
    await module.exports.waitForAnimationEnd(driver);
    // close the popup
    await module.exports.closePanel(driver);

    await driver.executeAsyncScript((callback) => {
      Components.utils.import("resource:///modules/CustomizableUI.jsm");
      CustomizableUI.removeWidgetFromArea("social-share-button");
      callback();
    });

    const shareButton = await module.exports.promiseAddonButton(driver);
    return shareButton === null;
  } catch (e) {
    if (e.name === "TimeoutError") {
      return false;
    }
    throw (e);
  }
};

module.exports.installAddon = async(driver) => {
  // references:
  //    https://bugzilla.mozilla.org/show_bug.cgi?id=1298025
  //    https://github.com/mozilla/geckodriver/releases/tag/v0.17.0
  const fileLocation = path.join(process.cwd(), process.env.XPI_NAME);
  const executor = driver.getExecutor();
  executor.defineCommand("installAddon", "POST", "/session/:sessionId/moz/addon/install");
  const installCmd = new cmd.Command("installAddon");

  const session = await driver.getSession();
  installCmd.setParameters({ sessionId: session.getId(), path: fileLocation, temporary: true });
  return executor.execute(installCmd);
};

module.exports.uninstallAddon = async(driver, id) => {
  const executor = driver.getExecutor();
  executor.defineCommand("uninstallAddon", "POST", "/session/:sessionId/moz/addon/uninstall");
  const uninstallCmd = new cmd.Command("uninstallAddon");

  const session = await driver.getSession();
  uninstallCmd.setParameters({ sessionId: session.getId(), id });
  await executor.execute(uninstallCmd);
};

module.exports.promiseAddonButton = async(driver) => {
  driver.setContext(Context.CHROME);
  try {
    return await driver.wait(until.elementLocated(
      By.id("social-share-button")), 1000);
  } catch (e) {
    // if there an error, the button was not found
    // so return null
    return null;
  }
};

module.exports.promiseUrlBar = (driver) => {
  driver.setContext(Context.CHROME);
  return driver.wait(until.elementLocated(
    By.id("urlbar")), 1000);
};

function getModifierKey() {
  const modifierKey = process.platform === "darwin" ?
    webdriver.Key.COMMAND : webdriver.Key.CONTROL;
  return modifierKey;
}

module.exports.copyUrlBar = async(driver) => {
  const urlBar = await module.exports.promiseUrlBar(driver);
  const modifierKey = getModifierKey();
  await urlBar.sendKeys(webdriver.Key.chord(modifierKey, "A"));
  await urlBar.sendKeys(webdriver.Key.chord(modifierKey, "C"));
};

module.exports.testAnimation = async(driver) => {
  const button = await module.exports.promiseAddonButton(driver);
  if (button === null) { return { hasClass: false, hasColor: false }; }

  const buttonClassString = await button.getAttribute("class");
  const buttonColor = await button.getCssValue("background-color");

  const hasClass = buttonClassString.split(" ").includes("social-share-button-on");
  const hasColor = buttonColor.includes("43, 153, 255");
  return { hasClass, hasColor };
};

module.exports.waitForClassAdded = async(driver) => {
  try {
    const animationTest = await driver.wait(async() => {
      const { hasClass } = await module.exports.testAnimation(driver);
      return hasClass;
    }, 1000);
    return animationTest;
  } catch (e) {
    if (e.name === "TimeoutError") { return null; }
    throw (e);
  }
};

module.exports.waitForAnimationEnd = async(driver) => {
  try {
    return await driver.wait(async() => {
      const { hasClass, hasColor } = await module.exports.testAnimation(driver);
      return !hasClass && !hasColor;
    }, 1000);
  } catch (e) {
    if (e.name === "TimeoutError") { return null; }
    throw (e);
  }
};

module.exports.takeScreenshot = async(driver) => {
  try {
    const data = await driver.takeScreenshot();
    return await Fs.outputFile("./screenshot.png",
      data, "base64");
  } catch (screenshotError) {
    throw screenshotError;
  }
};

module.exports.testPanel = async(driver, panelId) => {
  driver.setContext(Context.CHROME);
  try { // if we can't find the panel, return false
    return await driver.wait(async() => {
      // need to execute JS, since state is not an HTML attribute, it's a property
      const panelState = await driver.executeAsyncScript((panelIdArg, callback) => {
        const shareButtonPanel = window.document.getElementById(panelIdArg);
        if (shareButtonPanel === null) {
          callback(null);
        } else {
          const state = shareButtonPanel.state;
          callback(state);
        }
      }, panelId);
      return panelState === "open";
    }, 1000);
  } catch (e) {
    if (e.name === "TimeoutError") { return null; }
    throw e;
  }
};

module.exports.closePanel = async(driver, target = null) => {
  if (target !== null) {
    target.sendKeys(webdriver.Key.ESCAPE);
  } else {
    const urlbar = await module.exports.promiseUrlBar(driver);
    await urlbar.sendKeys(webdriver.Key.ESCAPE);
  }
};

// Returns array of pings of type `type` in sorted order by timestamp
// first element is most recent ping
// as seen in shield-study-addon-util's `utils.jsm`
module.exports.getMostRecentPingsByType = async(driver, type) =>
  driver.executeAsyncScript(async(typeArg, callback) => {
    Components.utils.import("resource://gre/modules/TelemetryArchive.jsm");
    const pings = await TelemetryArchive.promiseArchivedPingList();

    const filteredPings = pings.filter(p => p.type === typeArg);
    filteredPings.sort((a, b) => b.timestampCreated - a.timestampCreated);

    const pingData = filteredPings.map(ping => TelemetryArchive.promiseArchivedPingById(ping.id));

    callback(await Promise.all(pingData));
  }, type);

module.exports.gotoURL = async(driver, url) => {
  // navigate to a regular page
  driver.setContext(Context.CONTENT);
  await driver.get(url);
  driver.setContext(Context.CHROME);
};

class SearchError extends Error {
  constructor(condition) {
    const message = `Could not find ping satisfying condition: ${condition.toString()}`;
    super(message);
    this.message = message;
    this.name = "SearchError";
  }
}

module.exports.searchTelemetry = (conditionArray, telemetryArray) => {
  const resultingPings = [];
  for (const condition of conditionArray) {
    const index = telemetryArray.findIndex(ping => condition(ping));
    if (index === -1) { throw new SearchError(condition); }
    resultingPings.push(telemetryArray[index]);
  }
  return resultingPings;
};
