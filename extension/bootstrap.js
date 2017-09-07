const { interfaces: Ci, utils: Cu } = Components;
// Firefox components
// files included within the browser itself; wherever it's located in the FF codebase
// Services: translate resource URLs into another path (for share button CSS/panel button CSS)
// XPCOMUtils for defineLazyModuleGetter, as soon as call StudyUtils/Preferences for example, it will load it but not before, but for example for Services, I use it on Line 29 no point to lazily import it, only import the first time you use it, important for start-up time
// CustomizableUI: Has to do with adding Share Button to the toolbar.
// Normandy system addon (https://github.com/mozilla/normandy/tree/master/recipe-client-addon) is also a bootstrapped add-on, has a lot of this as well, mostly found out these by talking to others and looking at other bootstrapped add-ons
// Bootstrapped extensions page is useful, but mostly looking at examples.
// SearchFox or DXR: Lets you search through all the Mozilla Central code. Useful for looking as Services.jsm etc. to see how other parts of FF use these modules.
// SearchFox: http://searchfox.org/
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/CustomizableUI.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Preferences",
  "resource://gre/modules/Preferences.jsm");
// Not part of FF.
// Has part that sends pings to telemetry.
XPCOMUtils.defineLazyModuleGetter(this, "studyUtils",
  "resource://share-button-study/StudyUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "config",
  "resource://share-button-study/Config.jsm");
// Marc wrote PingStorage module; creates ping data he wants; saves ping to IndexedDB during study and a summary at end of study
// StudyUtils is called separately to send telemetry data
// chrome.manifest maps share-button-study directory
// Alternative method:
// - So don't have to change name of resource to name of study
// - How to define the SCRIPT_URI_SPEC (tricky); a global that gets filled in bootstrap.js scope
// - const STUDYUTILSPATH = `${__SCRIPT_URI_SPEC__}/../${studyConfig.studyUtilsPath}`;
// - const { studyUtils } = Cu.import(STUDYUTILSPATH, {});
XPCOMUtils.defineLazyModuleGetter(this, "PingStorage",
  "resource://share-button-study/PingStorage.jsm");

// Mapped to numbers; in all install, uninstall functions, REASON is passed as numbers.
// methods are called as part of the lifecycle of the extension, data types are predefined. This is on the bootstrap extension MDN page too.
const REASONS = {
  APP_STARTUP:      1, // The application is starting up.
  APP_SHUTDOWN:     2, // The application is shutting down.
  ADDON_ENABLE:     3, // The add-on is being enabled.
  ADDON_DISABLE:    4, // The add-on is being disabled. (Also sent during uninstallation)
  ADDON_INSTALL:    5, // The add-on is being installed.
  ADDON_UNINSTALL:  6, // The add-on is being uninstalled.
  // have had to use this to go through and fix prefs, database schemas etc.
  ADDON_UPGRADE:    7, // The add-on is being upgraded.
  ADDON_DOWNGRADE:  8, // The add-on is being downgraded.
};

// Firefox has a preferences system, you can see if you go to about:config. They're called preferences, but you can use them to store values as well. The preferences are stored under string names and you can set the preference and check the state of the preference. 
// If you need something to persist across multiple sessions, then can't store in memory of extension; can use localStorage or IndexedDB for larger amounts of data
// defining custom prefs for share button; period notation doesn't actually do anything; just info hierarchy
// avoid conflicting name; otherwise will change preference
const COUNTER_PREF = "extensions.sharebuttonstudy.counter";
// Mostly for testing purposes; set these prefs whenever you want in about:config
// Can make these prefs "extensions.sharebuttonstudy.counter" and set to whatever value and then run the extensions
const TREATMENT_OVERRIDE_PREF = "extensions.sharebuttonstudy.treatment";
const ADDED_BOOL_PREF = "extensions.sharebuttonstudy.addedBool";
const EXPIRATION_DATE_STRING_PREF = "extensions.sharebuttonstudy.expirationDateString";
const MAX_TIMES_TO_SHOW = 5;
// The way you inject CSS in bootstrap add-ons needs a different type of path than the resource URI
//// Ask more about this; why this is here. Needs a specific type of path.
const SHAREBUTTON_CSS_URI = Services.io.newURI("resource://share-button-study/share_button.css");
const PANEL_CSS_URI = Services.io.newURI("resource://share-button-study/panel.css");
const browserWindowWeakMap = new WeakMap();

/* HELPER FUNCTIONS FOR TREATMENTS */

function currentPageIsShareable(browserWindow) {
  // browser window refers to a specific window
  // gBrowser is C interface in chrome content, window.location equivalent
  const uri = browserWindow.window.gBrowser.currentURI;
  return uri.schemeIs("http") || uri.schemeIs("https");
}

// checks to see if sharebutton in toolbar, if the page we're on can be shared
// if window is really small, sharebutton is behind a ... menu, pop up doesn't have a good place to anchor to
function shareButtonIsUseable(shareButton) {
  return shareButton !== null && // the button exists
    // Whether or not you can click on a button (disabled)
    // disabled for blank page or about page
    // see currentPageIsShareable
    shareButton.getAttribute("disabled") !== "true" && // the page we are on can be shared
    shareButton.getAttribute("cui-areatype") === "toolbar" && // the button is in the toolbar
    shareButton.getAttribute("overflowedItem") !== "true"; // but not in the overflow menu"
}

// Could have a Treatment class with sendTelemetry, injectHTML, injectCSS methods etc.
// as written have to edit in every location for every treatment
async function highlightTreatment(browserWindow, shareButton, incrementCounter = true) {
  if (shareButtonIsUseable(shareButton)) {
    // some treatments are called from another treatment, in that case, you don't want to increment the counter in Prefs
    // ex: doorhanger ask to add can call the doorhanger do nothing treatment (ex; if share button is already in the toolbar and you're in ask to add, then what you do is show the standard doorhanger/panel notification and that would be the exact same thing as doorhanger do nothing (do nothing refers to the actual adding of the share button to the toolbar)), but since you're incrementing already from top level treatment
    // you don't want to increment from this sub level treatment you're calling
    if (incrementCounter) {
      Preferences.set(COUNTER_PREF, Preferences.get(COUNTER_PREF, 0) + 1);
    }
    // send telemetry ping for highlight treatment occuring
    const pingData = { treatment: "highlight" };
    await studyUtils.telemetry(pingData);
    // store that ping for complete report at end of study
    await PingStorage.logPing(pingData);
    // add the event listener to remove the css class when the animation ends
    // need a way to trigger animation, so good to keep animation end too, though keyframes may have a number of loops
    shareButton.addEventListener("animationend", browserWindow.animationEndListener);
    shareButton.classList.add("social-share-button-on");
  }
}

async function doorhangerDoNothingTreatment(browserWindow, shareButton, incrementCounter = true) {
  if (shareButtonIsUseable(shareButton)) {
    if (incrementCounter) {
      Preferences.set(COUNTER_PREF, Preferences.get(COUNTER_PREF, 0) + 1);
    }
    const pingData = { treatment: "doorhanger" };
    await studyUtils.telemetry(pingData);
    await PingStorage.logPing(pingData);
    // Each browser window is like an HTML page with JS. window is the underlying window document.
    // The first time this happens, this will be null; in subsequent times it will always be there
    // in a hidden state
    let panel = browserWindow.window.document.getElementById("share-button-panel");
    if (panel === null) { // create the panel
      panel = browserWindow.window.document.createElement("panel");
      panel.setAttribute("id", "share-button-panel");
      panel.setAttribute("class", "no-padding-panel");
      panel.setAttribute("type", "arrow");
      panel.setAttribute("noautofocus", true);
      panel.setAttribute("level", "parent");

      // The way the panel object works (see MDN for panel)
      // the panel outer element is the UI part; the embedded browser parts lets you embedd
      // an HTMl doc within the panel.
      // had trouble using CSS directly on the panel, so embedded another page inside
      // SearchFox you can find the original share button implementation which uses something like this;
      // but SearchFox defaults to Nightly version, and in 57
      // share button is removed, but you can search for older versions of FF
      // There's a way to get an inspect element/Dev Tools that also looks at the browser UI so that you can more easily find something in SearchFox
      // In Dev Tools, click Gear, Under Advanced Settings, enable last two checkboxes
      // Tools > Web Developer > Browser Toolbox (dev tools that include UI inspecting)
      // Pick inspector button where you can hover and it will select; it's kind of buggy
      const embeddedBrowser = browserWindow.window.document.createElement("browser");
      embeddedBrowser.setAttribute("id", "share-button-doorhanger");
      embeddedBrowser.setAttribute("src", "resource://share-button-study/doorhanger.html");
      embeddedBrowser.setAttribute("type", "content");
      embeddedBrowser.setAttribute("disableglobalhistory", "true");
      embeddedBrowser.setAttribute("flex", "1");

      panel.appendChild(embeddedBrowser);
      // One of the things the share button panel does. All popups have to be children of this pop up set
      // mainPopupSet is a default element in Firefox
      // Browser window as HTML document, once create element, need to put it somewhere, this is where
      // the original FF share button put its element
      // This is actually adding it to the browser!
      browserWindow.window.document.getElementById("mainPopupSet").appendChild(panel);
    }
    // openPopup is a firefox specific method on the panel object (a XUL element)
    // XUL is an HTML like language FF uses for its chrome
    // shareButton is the anchor used to display it, other arguments are where to put it
    // relative to where the shareButton is.
    panel.openPopup(shareButton, "bottomcenter topright", 0, 0, false, false);
  }
}

async function doorhangerAskToAddTreatment(browserWindow, shareButton) {
  // Do not re-add to toolbar if user removed manually
  if (Preferences.get(ADDED_BOOL_PREF, false)) { return; }

  Preferences.set(COUNTER_PREF, Preferences.get(COUNTER_PREF, 0) + 1);

  // check to see if we can share the page and if the share button has not yet been added
  // if it has been added, we do not want to prompt to add
  if (currentPageIsShareable(browserWindow) && shareButton === null) {
    let panel = browserWindow.window.document.getElementById("share-button-ask-panel");
    if (panel === null) { // create the panel
      panel = browserWindow.window.document.createElement("panel");
      panel.setAttribute("id", "share-button-ask-panel");
      panel.setAttribute("class", "no-padding-panel");
      panel.setAttribute("type", "arrow");
      panel.setAttribute("noautofocus", true);
      panel.setAttribute("level", "parent");

      panel.addEventListener("click", () => {
        CustomizableUI.addWidgetToArea("social-share-button", CustomizableUI.AREA_NAVBAR);
        panel.hidePopup();
        highlightTreatment(browserWindow, browserWindow.shareButton, false);
        Preferences.set(ADDED_BOOL_PREF, true);
      });

      const embeddedBrowser = browserWindow.window.document.createElement("browser");
      embeddedBrowser.setAttribute("id", "share-button-ask-doorhanger");
      embeddedBrowser.setAttribute("src", "resource://share-button-study/ask.html");
      embeddedBrowser.setAttribute("type", "content");
      embeddedBrowser.setAttribute("disableglobalhistory", "true");
      embeddedBrowser.setAttribute("flex", "1");

      panel.appendChild(embeddedBrowser);
      browserWindow.window.document.getElementById("mainPopupSet").appendChild(panel);
    }
    const burgerMenu = browserWindow.window.document.getElementById("PanelUI-menu-button");
    if (burgerMenu !== null) {
      // only send the telemetry ping if we actually open the panel
      const pingData = { treatment: "ask-to-add" };
      await studyUtils.telemetry(pingData);
      await PingStorage.logPing(pingData);
      panel.openPopup(burgerMenu, "bottomcenter topright", 0, 0, false, false);
    }
  } else if (shareButtonIsUseable(shareButton)) {
    doorhangerDoNothingTreatment(browserWindow, browserWindow.shareButton);
  }
}

async function doorhangerAddToToolbarTreatment(browserWindow, shareButton) {
  // Do not re-add to toolbar if user removed manually
  if (Preferences.get(ADDED_BOOL_PREF, false)) { return; }

  Preferences.set(COUNTER_PREF, Preferences.get(COUNTER_PREF, 0) + 1);

  // check to see if the page will be shareable after adding the button to the toolbar
  if (currentPageIsShareable(browserWindow) && !shareButtonIsUseable(shareButton)) {
    const pingData = { treatment: "add-to-toolbar" };
    await studyUtils.telemetry(pingData);
    await PingStorage.logPing(pingData);
    CustomizableUI.addWidgetToArea("social-share-button", CustomizableUI.AREA_NAVBAR);
    Preferences.set(ADDED_BOOL_PREF, true);
    // need to get using browserWindow.shareButton because the shareButton argument
    // was initialized before the button was added
  }
  doorhangerDoNothingTreatment(browserWindow, browserWindow.shareButton, false);
}

// map from the name to the functions
// define treatments as STRING: fn(browserWindow, shareButton)
const TREATMENTS = {
  // these methods called in the Copy Controller on copy event
  // control branch; don't do anything
  // treatment functions are only there to show additional visual elements, we've already send a ping for the copy event within the copy controller
  // so we don't need to do any data collection
  // call a function in the copy controller
  // when get a copy event, call one of these different treatments depending on which branch the user is in
  control: () => {},
  // does a blue CSS animation that highlights the share button
  highlight:              highlightTreatment,
  // shows a panel or doorhanger but not add the sharebutton to the toolbar; so only happens if share button in toolbar
  doorhangerDoNothing:    doorhangerDoNothingTreatment,
  // same thing as above if share button in tool bar, if not in toolbar, has a pop up do you want to add the share button to the toolbar
  doorhangerAskToAdd:     doorhangerAskToAddTreatment,
  // shares the same panel aka doorhanger as the other two, but automatically adds the sharebutton without asking the user
  doorhangerAddToToolbar: doorhangerAddToToolbarTreatment,
};

// Looks at the Preference constants to see if want to override the treatment or variation, otherwise it uses the StudyUtils way of choosing a variation
// If you don't set the Preference, then how does it choose the variation in the default way; not the Preference part but the rest of it is copied for every study because this isn't part of the StudyUtils lib.
// The code after Preferences are like what Gregg has in shield studies utils add-on repo.
async function chooseVariation() {
  let variation;
  // if pref has a user-set value, use this instead
  if (Preferences.isSet(TREATMENT_OVERRIDE_PREF)) {
    // variations in config include a weight (highly weighted happens more often)
    // here i create a fake weighted variation object and use it as though it's comming from the config file (this file comes from StudyUtils)
    // you can copy the config file from the example utils repo; basically a javascript file
    // for this study it is Config.jsm.
    variation = {
      name: Preferences.get(TREATMENT_OVERRIDE_PREF, null), // there is no default value
      weight: 1,
    };
    // You can set the preference to any value you want, but not all values are supported by the extension
    // TREATMENTS variable keys are the valid treatment values, which also refer to functions, which are used later on
    if (variation.name in TREATMENTS) { return variation; }
    // if the variation from the pref is invalid, then fall back to standard choosing
    // If someone sets the treatment via preference, make sure it's a valid treatment, otherwise choose it the regular way
  }

  // exposes hashFraction and chooseWeighted functions
  const sample = studyUtils.sample;
  // this is the standard arm choosing method
  const clientId = await studyUtils.getTelemetryId();
  const hashFraction = await sample.hashFraction(config.study.studyName + clientId);
  variation = sample.chooseWeighted(config.study.weightedVariations, hashFraction);
  // every time you start up the extension, you'll get the same variation, because it's based on your client ID and study name

  // If Preferences override (or if that doesn't exist), default variation selection from StudyUtils don't produce a valid variation name
  // It's still possible to write whatever you want in the Config file; checks for author error; similar as the Preference check, because could write any value in the Preferences as well; want to make sure variation name in Config file is actually one supported in the addon.
  // if the variation chosen by chooseWeighted is not a valid treatment (check in TREATMENTS),
  // then throw an exception: this means that the config file is wrong
  // TREATMENTS and Config.jsm file should be mirrors of each other
  if (!(variation.name in TREATMENTS)) {
    throw new Error(`The variation "${variation.name}" is not a valid variation.`);
  }

  return variation;
}

class CopyController {
  // See https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/Property/controllers
  // pass in a browserWindow so that it knows which URL bar we're talking about so it can call the correct controller for that specific URL bar
  constructor(browserWindow) {
    this.browserWindow = browserWindow;
    // which branch of the study to apply
    // This just gives you whatever you passed in for setVariation, so .name is specific to what Marc passed in here
    this.treatment = studyUtils.getVariation().name;
  }

  // these are standard methods that a controller has
  // See https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/Property/controllers
  // wrapped these in a class so can add browser Window and treatment properties.
  supportsCommand(cmd) { return cmd === "cmd_copy" || cmd === "cmd_cut" || cmd === "share-button-study"; }

  isCommandEnabled() { return true; }

  async doCommand(cmd) {
    if (cmd === "cmd_copy" || cmd === "cmd_cut") {
      // Iterate over all other controllers and call doCommand on the first controller
      // that supports it
      // Skip until we reach the controller that we inserted
      let i = 0;
      const urlInput = this.browserWindow.urlInput;

      // You can't know for sure the controller you injected is at position 0, so you have to iterate through all controllers again
      for (; i < urlInput.controllers.getControllerCount(); i++) {
        const curController = urlInput.controllers.getControllerAt(i);
        // custom command "share-button-study"
        // When trying to figure out which controller Marc inserted, which one is his custom copy controller
        if (curController.supportsCommand("share-button-study")) {
          i += 1;
          break;
        }
      }
      // using same i, so after find custom controller, starting at the next controller in the list after that
      // this loop is to ensure any subsequent controllers that support the copy, cut etc. commands that the custom controller needs
      // still get these commands applied to them
      // As written, this only looks for the next controller that supports these commands
      // Marc believes there's only one built in controller that uses these
      // when did this originally and just inject, copy and paste didn't work because it wasn't applied to the default controller
      for (; i < urlInput.controllers.getControllerCount(); i++) {
        const curController = urlInput.controllers.getControllerAt(i);
        if (curController.supportsCommand(cmd)) {
          curController.doCommand(cmd);
          break;
        }
      }

      // Send telemetry ping every time copy event happens
      const pingData = { event: "copy" };
      await studyUtils.telemetry(pingData);
      // log ping data too to send complete set of data at end of study over telemetry as well
      await PingStorage.logPing(pingData);
      // Everything that's part of the UI uses HTML and JavaScript to display everything
      // It uses an HTML-like language called XUL
      // This is like if you did document.getElementById
      // If you're in the context of the browser chrome
      // This gets the DOM element for the share button, an HTML-like object that you can add css properties to
      const shareButton = this.browserWindow.shareButton;
      // check to see if we should call a treatment at all
      // Only show treatment MAX_TIMES_TO_SHOW; if shown already max, don't show it!
      // This checks that.
      const numberOfTimeShown = Preferences.get(COUNTER_PREF, 0);
      if (numberOfTimeShown < MAX_TIMES_TO_SHOW) {
        // In the case we want to show the treatment, we call the TREATMENTS object
        // this maps the Treatment name to the treatment function
        // Applies the treatment to this specific browser window and share button
        // These are all the functions at the top of the file
        // There's an instance of the share button for every window, so you need to know which window and which share button you're dealing with
        // think of each window as its own HTML doc with its own elements like share button
        await TREATMENTS[this.treatment](this.browserWindow, shareButton);
      }
    }
  }

  // This method is part of the Controller structure methods (see MDN docs)
  // See https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/Property/controllers
  // Just didn't need it.
  onEvent() {}
}


class BrowserWindow {
    // Instantiate class with current window
  constructor(window) {
    this.window = window;

    // bind functions that are called externally so that `this` will work
    // These methods are called elsewhere in bootstrap.js
    this.animationEndListener = this.animationEndListener.bind(this);
    this.insertCopyController = this.insertCopyController.bind(this);
    this.removeCopyController = this.removeCopyController.bind(this);
    this.addCustomizeListener = this.addCustomizeListener.bind(this);
    this.removeCustomizeListener = this.removeCustomizeListener.bind(this);

    // initialize CopyController
    this.copyController = new CopyController(this);
  }

  get urlInput() {
    // Get the "DOM" elements
    const urlBar = this.window.document.getElementById("urlbar");
    if (urlBar === null) { return null; }
    // XUL elements are different than regular children
    return this.window.document.getAnonymousElementByAttribute(urlBar, "anonid", "input");
  }

  get shareButton() {
    return this.window.document.getElementById("social-share-button");
  }

  insertCopyController() {
    // by default in Firefox there's a controller that adds http etc to a URL
    // We add another controller at the beginning of that list of controllers being added
    // There are a set of commands and a set of controllers
    // When the URL bar receives an event like command copy; it will go through all its controllers and
    // see if that controller supports the command
    // If it sees one that does, there's no guarantee it will go through all the others and check
    // Double check this! ^
    // refresh urlInput reference, this is potentially changed by the customize event
    this.urlInput.controllers.insertControllerAt(0, this.copyController);
  }

  removeCopyController() {
    // refresh urlInput reference, this is potentially changed by the customize event
    this.urlInput.controllers.removeController(this.copyController);
  }

  animationEndListener() {
    // When the animation is done, we want to remove the CSS class
    // so that we can add the class again upon the next copy and
    // replay the animation
    this.shareButton.classList.remove("social-share-button-on");
  }

  addCustomizeListener() {
    this.window.addEventListener("customizationending", this.insertCopyController);
  }

  removeCustomizeListener() {
    this.window.removeEventListener("customizationending", this.insertCopyController);
  }

  insertCSS() {
    const utils = this.window.QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIDOMWindowUtils);
    utils.loadSheet(SHAREBUTTON_CSS_URI, utils.AGENT_SHEET);
    utils.loadSheet(PANEL_CSS_URI, utils.AGENT_SHEET);
  }

  removeCSS() {
    const utils = this.window.QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIDOMWindowUtils);
    utils.removeSheet(SHAREBUTTON_CSS_URI, utils.AGENT_SHEET);
    utils.removeSheet(PANEL_CSS_URI, utils.AGENT_SHEET);
  }

  startup() {
    // Browser console window is also a window, but we don't want to inject there. There is no URL bar there.
    // Inject a new controller in the URL bar of the window.
    // When there's a copy event/command, do something, then pass the rest on to the actual CopyController
    // if there is no urlBar / urlInput, we don't want to do anything
    // (ex. browser console window)
    if (this.urlInput === null) return;

    // Used in the shutdown function for the bootstrap extension (bootstrap)
    // bootstrap extensions don't do any clean up for you, it will just stay there until the browser restarts
    // have to manually remove things you inject.
    // Have I already added to this window?
    // Ask Gregg or someone; WeakMap about JS Garbage Collection
    // Objects will get GCed once there are no more references to them
    // Say you have a map to all the windows, the window is closed; in map, window1 points to a corresponding window object
    // won't be able to GC this, because it still points to it.
    // Holding onto a pointer to the window, since you have that, it won't get GCed.
    // If use a weak map, that pointer will not prevent the window object from being GCed.
    // Look at MDN article on Weak Map.
    // Say you want to keep track of every tab you've ever seen; say you make a normal object
    // keys are URLS, but some tabs could have same URLs
    // Other option: take tab name and put in object somewhere where tab name is key
    // WeakMaps can take other things besides string-like keys. Good for storing C++ type things like windows and tabs
    // Also for Garbage Collection
    browserWindowWeakMap.set(this.window, this);

    // When you click on customize to drag the share button to the toolbar and click to exit,
    // The copy controller is removed due to a refresh of the toolbar, so we have to reinject it after this.
    // Peculiarity to how copy controllers work. If you open the Customize menu to add the share button,
    // It will actually remove everything from the toolbar and re-add everything, so what you inject will be removed
    // Add event listener to wait for the Customize event to be over and then re-add the Copy Controller
    // The customizationending event represents exiting the "Customize..." menu from the toolbar.
    // We need to handle this event because after exiting the customization menu, the copy
    // controller is removed and we can no longer detect text being copied from the URL bar.
    // See DXR:browser/base/content/browser-customization.js
    this.addCustomizeListener();

    // Load the CSS with the shareButton animation
    this.insertCSS();

    // insert the copy controller to detect copying from URL bar
    this.insertCopyController();

    // Something that everywhere in FF can hear. All processes, backgrounds, windows hear this.
    // Can send a global observer message to sendTelemetry and have telemetry observer listen to that
    // Anywhere you have code listening on the global observer service will be notified
    // Publish any message you want and any number of listeners can listen to it
    // add-ons can't start up until the main browser has start up
    // add-ons listen for a special message from the browser to start-up
    // Emit notification that the code has been injected
    // This is for testing purposes.
    // This may not be in the tests anymore
    // It's difficult to know that your code has been injected correctly
    // This is intended to send a global message that the code has been injected
    // In the test, add an event listener for that, open a new window and it should say the code has been injected
    // Marc may have removed this because it was hard to open new windows in the testing framework he was using
    // Pretty specific to this study.
    Services.obs.notifyObservers(null, "share-button-study-init-complete");
  }

  shutdown() {
    // Remove the customizationending listener
    this.removeCustomizeListener();

    // Remove the CSS
    this.removeCSS();

    // Remove the copy controller
    this.removeCopyController();

    // Remove the share-button-panel
    const sharePanel = this.window.document.getElementById("share-button-panel");
    if (sharePanel !== null) {
      sharePanel.remove();
    }
    // Remove the share-button-ask-panel
    const shareAskPanel = this.window.document.getElementById("share-button-ask-panel");
    if (shareAskPanel !== null) {
      shareAskPanel.remove();
    }

    // Remove modifications to shareButton (modified in CopyController)
    if (this.shareButton !== null) {
      // if null this means there is no shareButton on the page
      // so we don't have anything to remove
      this.shareButton.classList.remove("social-share-button-on");
      this.shareButton.removeEventListener("animationend", this.animationEndListener);
    }
  }
}

// see https://dxr.mozilla.org/mozilla-central/rev/53477d584130945864c4491632f88da437353356/xpfe/appshell/nsIWindowMediatorListener.idl
const windowListener = {
  onWindowTitleChange() { },
  onOpenWindow(xulWindow) {
    // xulWindow is of type nsIXULWindow, we want an nsIDOMWindow
    // see https://dxr.mozilla.org/mozilla-central/rev/53477d584130945864c4491632f88da437353356/browser/base/content/test/general/browser_fullscreen-window-open.js#316
    // for how to change XUL into DOM
    const domWindow = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIDOMWindow);

    // we need to use a listener function so that it's injected
    // once the window is loaded / ready
    const onWindowOpen = () => {
      domWindow.removeEventListener("load", onWindowOpen);
      const browserWindow = new BrowserWindow(domWindow);
      browserWindow.startup();
    };

    domWindow.addEventListener("load", onWindowOpen, true);
  },
  onCloseWindow() { },
};

// Most bootstrap add-ons just ignore this; you need to include one
// not sure why people don't actually use it. Usually startup method takes care of most things.
// otherwise will throw an error
this.install = function() {};

// INIT METHOD for the extension
// args are part of bootstrap framework; these are what's passed in from the browser
// data gives you some info about the add-on (id, version number, etc.), reason is a number value, see top of script ex: INSTALL
this.startup = async function(data, reason) {
  studyUtils.setup({
    // config: one of the JSMs we imported up top. put variations in there, survey links want to show at the end, some other things
    ...config,
    addon: { id: data.id, version: data.version },
  });
  const variation = await chooseVariation();
  studyUtils.setVariation(variation);

  // Always set EXPIRATION_DATE_PREF if it not set, even if outside of install.
  // This is a failsafe if opt-out expiration doesn't work, so should be resilient.
  // Also helps for testing.
  // The study is supposed to expire in a certain amount of time (here we say 2 weeks); if it hasn't been set, set it to 2 weeks from the current date
  // set expiration date as a string; checks if current date is greater than expiration date
  // this is outside the next if block so that it's more resilient to failure; it will be called every time, but only actually be set
  // expiration date is really a failsafe, for optout studies there's a way to disable it on the recipe server.
  if (!Preferences.has(EXPIRATION_DATE_STRING_PREF)) {
    const now = new Date(Date.now());
    const expirationDateString = new Date(now.setDate(now.getDate() + 14)).toISOString();
    Preferences.set(EXPIRATION_DATE_STRING_PREF, expirationDateString);
  }

  if (reason === REASONS.ADDON_INSTALL) {
    // reset to counter to 0 primarily for testing purposes
    // COUNTER_PREF tracks how many times a treatment (ex: popup or highlight) has been shown to the user; want to put a limit on that; say after 5 times we stop showing popup
    // If Counter hits 5, stops showing that treatment, there stops being any effect when highlighting and copying URL, but still pings telemetry data
    // for this study, telemetry data sends ping a copy event, each time a treatment is shown, at end of the study, sends # of share button clicks and clicks within the social panel
    // ISSUE: Using built-in FF telemetry data, these are stored on a per session basis, so only actually sends last session for # clicks
    // all telemetry is stored in indexedDB database. Like sending pings at event level and at the end of the study as a summary
    // look at PingStorage.jsm file; functions to send telemetry ping and save to IndexedDB as well
    // At end, take every ping that was sent and put in summary (ex: includes if share button is in the toolbar)
    Preferences.set(COUNTER_PREF, 0);
    // reset force added boolean pref
    // Similar to counter_pref, but for the case that we aggressively add the button to the toolbar in case of copying. Even if share button is not there.
    // Don't want to keep doing that if they remove the share button afterwards, so we only add it one time, so this is to keep track of that
    // reset this pref to be false
    // If pref set to false, aggressively add
    // There's another treatment with a popup window that asks first, it doesn't aggressively do it. In this case as well, if they click to add it, at any point after that we don't ask them again
    // Initialize pref value; not strictly necessary, when first retrieve value, give it a default value
    // Mostly for testing (manual or automated), if set it to true and then rerun the extension; since value already exists, it will just use whatever is there
    Preferences.set(ADDED_BOOL_PREF, false);
    // Sends a special telemetry ping for the installation
    // Ask Gregg what this is for.
    studyUtils.firstSeen(); // sends telemetry "enter"
    // template; isEligible currently returns true in Config.jsm.
    // This is more fine grained eligibility stuff than can be specified in Normandy
    // Ex: Anyone who already has a share button added (test for shareButton) or other user prefs or if they've already toggled UI elements
    const eligible = await config.isEligible(); // addon-specific
    if (!eligible) {
      // uses config.endings.ineligible.url if any,
      // sends UT for "ineligible"
      // then uninstalls addon
      // this reason is used to specify an ending; have different ending if user is ineligible versus if they complete the study
      // ex: uninstall the add-on from the machine
      await studyUtils.endStudy({ reason: "ineligible" });
      return;
    }
  }
  // This reason is the Bootstrap reason, like ADD_ON_INSTALL etc.
  // sets experiment as active and sends installed telemetry upon first install
  await studyUtils.startup({ reason });

  // checking if the study has expired; this may not be necessary depending on what's determinable from Normandy
  // This may just be a failsafe; in theory should be able to do from recipe server too.
  const expirationDate = new Date(Preferences.get(EXPIRATION_DATE_STRING_PREF));
  if (Date.now() > expirationDate) {
    studyUtils.endStudy({ reason: "expired" });
  }

  // Gets all browser windows and iterates over all of them and instantiates a browser window object and calls the Browser Window class on that instance.
  // This will insert the share button HTML/CSS and listen for specific events (copy controller for when user copies URL)
  // iterate over all open windows
  const windowEnumerator = Services.wm.getEnumerator("navigator:browser");
  while (windowEnumerator.hasMoreElements()) {
    const window = windowEnumerator.getNext();
    const browserWindow = new BrowserWindow(window);
    browserWindow.startup();
  }

  // handles subsequently open windows to inject share-button HTML and CSS and listen for copying URL.
  // add an event listener for new windows
  Services.wm.addListener(windowListener);
};

// shutdown is a lifecycle method for the extension
this.shutdown = async function(data, reason) {
  // remove event listener for new windows before processing WeakMap
  // to avoid race conditions (ie. new window added during shutdown)
  // the case where you open a new window while shutdown method is executing iterating over currently open windows
  // If you remove add-on code from currently open windows first, say you open a new window, the event listener
  // will still be there, at that point the windowEnumerator object may not include the window you created
  // remove this one first so any new windows will not get the add on code, then iterate over currently open windows
  Services.wm.removeListener(windowListener);

  // for use in summary ping
  let hasShareButton = false;

  // Remove share button study code from all windows
  // windowEnumerator is a list of open window objects; not an array
  const windowEnumerator = Services.wm.getEnumerator("navigator:browser");
  while (windowEnumerator.hasMoreElements()) {
    const window = windowEnumerator.getNext();
    // this lets us know that that window had add-on code injected in it, so we don't call the shutdown object
    // when we didn't actually change anything
    // that can be the case say even though we're targeting browser windows, windowEnumerator includes windows like devTools that we don't care
    // about and don't inject code into
    // browserWindowWeakMap is the list of windows we actually modified!
    if (browserWindowWeakMap.has(window)) {
      const browserWindow = browserWindowWeakMap.get(window);
      // boolean is used in send sumary ping data; at the end of the study did the user have the share button or not.
      if (browserWindow.shareButton !== null) { hasShareButton = true; }
      // browserWindow class in this file; removes CSS, removes CopyControllers
      browserWindow.shutdown();
    }
  }

  // shutdown is called for more reasons than just Uninstall and Disable, also called when the Firefox process is closed
  // Firefox process is closed: If you quit Firefox
  // shutdown is called when application (browser) is quitting
  // in standard case, undo everything from start up function: remove event listener for new windows, iterating all open windows, injecting add on code with browserWindow.startUp
  // in shutdown, reset state of the windows to be the state before you injected the code
  // remove all add on code from browser windows we've modified and from adding to new windows, call browserWindow.shutdown
  // want a blank starting point
  // all prefs, indexedDB storage, telemetry init/studyUtils are not touched in default case
  // in case of uninstall or disable, have no chance to clean up at any other point so want to:
  // remove all the normal default case stuff above
  // remove all the persistent things you did like Prefs, IndexedDB and send summary ping 
  // are we uninstalling?
  // if so, user or automatic?
  if (reason === REASONS.ADDON_UNINSTALL || reason === REASONS.ADDON_DISABLE) {
    // reset the preference
    // this will delete it since there is no value in the default branch
    // **should also reset other preferences; reset actually deletes the pref since it's not
    // a firefox pref.
    // There's a system preference set and a user preference set, once you reset a pref it will fallback to
    // default setting, and if the default pref doesn't exist, it will delete entirely.
    // This custom pref lives in the user set of preferences.
    Preferences.reset(COUNTER_PREF);

    // send summary ping
    const allPings = await PingStorage.getAllPings();
    await PingStorage.clear();
    await PingStorage.close();
    // transform every value into string, such that we satisfy string -> string map from schema
    // note: prefer .toString() over JSON.stringify() when possible to minimize strange formatting
    // bundling and reformatting data from storage/memory (PingStorage.jsm) for sending via telemetry
    const summaryPingData = {
      hasShareButton: hasShareButton.toString(),
      numberOfTimesURLBarCopied: allPings.filter(ping => ping.event === "copy").length.toString(),
      numberOfShareButtonClicks: Services.telemetry.getHistogramById("SOCIAL_TOOLBAR_BUTTONS").snapshot().counts[0].toString(),
      numberOfSharePanelClicks: Services.telemetry.getHistogramById("SOCIAL_PANEL_CLICKS").snapshot().counts[0].toString(),
      // let's say you install the study, and copy from the URL bar; every time you copy, sends telemetry ping at time you copy
      // in addition it also stores that ping in the database
      // at the end of the study when the add on is being uninstalled, it collects all those event level pings
      // bundles them all into an array and sends them off at one time.
      // this makes the data analysis easier so that Kamyar can get all the summary pings, one for every person enrolled in the study
      // Okay I can look at all the pings they sent in the entire study by looking at the summary key.
      // Instead of saying in telemetry, search all the pings for this telemetry ID, really inefficient
      // this is a shortcut of icnluding all the pings we sent before in one final ping.
      summary: JSON.stringify(allPings),
    };
    await studyUtils.telemetry(summaryPingData);

    // Not exactly sure how this works. There's a flag within study utils: is the study within the process of being ended?
    // any time you call endStudy, it sets this to be true
    // if we're trying to end the study and the flag is false, that means no one else is trying to end the study
    // Ex: in eligibility function in start up, if user is determined to be ineligible, calls endStudy
    // go through isEligible funciton, return false, case is user is ineligible
    // then close firefox window which triggers this shutdown method
    // both the ineligible portion will trigger this study and this shutdown method
    // the first one sets the isEnding flag to be true
    // check to see if something is ending the study
    // if not, the reason why is that it's being uninstalled or disabled by the user
    if (!studyUtils._isEnding) {
      // we are the first requestors, must be user action.
      studyUtils.endStudy({ reason: "user-disable" });
    }
  }
};

// bootstrapped extension default method; startup and shutdown will always be called to install and uninstall methods
// install happens before you can actually do anything
// uninstall happens after you've already done everything
// Might be a reason why, but Marc doesn't know
this.uninstall = function() {};
