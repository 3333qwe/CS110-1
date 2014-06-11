(function() {
        if(!this.hasOwnProperty("amznMusic")) amznMusic = {};
        
        amznMusic.uploader = amznMusic.uploader || {};
        
        amznMusic.uploader.Updater = Class.extend({
             init: function(url){
                 updateURL = url;
                 amznMusic.uploader.checkingForUpdates = true;
            },
            checkForUpdates : function() {
                 $.proxy(initialize,this)();
            },
            getCurrentVersion : function () {
                var returnVal = "Loading version...";
                if(appUpdater) returnVal = appUpdater.currentVersion;
                return returnVal;
            }
        });
        
        var appUpdater;
        var updateURL;
        
        function initialize() {
            var isWindows = air.Capabilities.os.indexOf("Win") != -1;
            if (!appUpdater) {
                
                appUpdater = new window.runtime.com.amazon.nativeApplicationUpdater.NativeApplicationUpdaterUI();
                appUpdater.signerName = "Amazon Services LLC";
                
                appUpdater.updateURL = updateURL;
                
                appUpdater.addEventListener("beforeInstall", onEvent);
                appUpdater.addEventListener("checkForUpdate", onEvent);
                appUpdater.addEventListener("downloadComplete", onEvent);
                appUpdater.addEventListener("downloadError", onEvent);
                appUpdater.addEventListener("downloadStart", onEvent);
                appUpdater.addEventListener("error", onEvent);
                appUpdater.addEventListener("fileUpdateError", onEvent);
                appUpdater.addEventListener("fileUpdateStatus", onEvent);
                appUpdater.addEventListener("initialized", onEvent);
                appUpdater.addEventListener("progress", onEvent);
                appUpdater.addEventListener("updateError", onEvent);
                appUpdater.addEventListener("updateStatus", onEvent);
                appUpdater.addEventListener("cancel", onEvent);
                appUpdater.addEventListener("signatureVerified", onEvent);
                
                // setting the event handler for INITIALIZED
                appUpdater.addEventListener(air.UpdateEvent.INITIALIZED, 
                    onInit);
                
                appUpdater.addEventListener("cancel", onCancel);
                    
                appUpdater.isCheckForUpdateVisible = false;
                //appUpdater.isDownloadUpdateVisible = false;
                //appUpdater.isInstallUpdateVisible = false;
                // It initializes the update framework, silently installing synchronously 
                // any pending updates. It is required to call this method during application
                // startup because it may restart the application when it is called.
                appUpdater.initialize();
            }
        }
        
        function onEvent(event) {
            window.logger.log("updater.js onEvent(event) args = "+[event].toString());
            var eventString = event.toString().toLowerCase();
            if(eventString.indexOf("error") != -1) {
                window.uploader.error = "A problem occured trying to update the application. Check the log file for more details."
                amznMusic.killState = true;
            }
            if(event.type == "updateStatus" && appUpdater.updateDescriptor) {
                window.logger.log("updater.js onEvent(event) " + appUpdater.updateDescriptor);
            }
            
            if(event.type == "updateStatus" && !event.available) {
                amznMusic.uploader.checkingForUpdates = false;
                window.logger.log("dispatching " + window.uploader.parentInterface.UPDATE_CHECK_COMPLETE);
                window.amznMusic.uploader.eventBind.trigger(window.uploader.parentInterface.UPDATE_CHECK_COMPLETE);
            }
        }
        
        function onInit(event) {
            window.document.title += " v"+ appUpdater.currentVersion;
            window.logger.log("updater.js onInit(event) current version = " +appUpdater.currentVersion);
            appUpdater.checkNow();
        }
        
        function onCancel(event) {
            window.logger.log("updater.js onCancel() cancel called on update ui... closing the app");
            window.uploader.parentInterface.close();
        }
})();
