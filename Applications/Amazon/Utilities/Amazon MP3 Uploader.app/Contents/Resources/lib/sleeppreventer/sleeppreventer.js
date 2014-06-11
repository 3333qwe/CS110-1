/*global amznMusic.uploader, jQuery, */
// Requires AIRAliases.js
// Requires jquery-1.4.2.js

(function(){
    amznMusic.uploader = amznMusic.uploader || {};

    var binaryName = "SleepPreventer.exe";
    
    //--------------------------------------
    //  Class SleepPreventer
    //  While the exe is running windows will not go to sleep.
    //--------------------------------------
    amznMusic.uploader.SleepPreventer = Class.extend({
        init: function(){
            this.p = new air.NativeProcess();
            this.p.addEventListener(air.ProgressEvent.STANDARD_OUTPUT_DATA, $.proxy(p_stdout, this));
            this.p.addEventListener(air.ProgressEvent.STANDARD_ERROR_DATA,$.proxy(p_stderr, this));
            this.pinfo = new air.NativeProcessStartupInfo();
            if(air.Capabilities.os == "Windows XP") binaryName = "SleepPreventerXP.exe";
			else if(air.Capabilities.os.toUpperCase().indexOf("MAC") !== -1) binaryName = "SleepPreventer";
            this.pinfo.executable = air.File.applicationDirectory.resolvePath("lib/sleeppreventer/"+binaryName);
            this.inited = true;
        },
        start :function() {
            if (!this.inited) init();
            if(!this.p.running) this.p.start(this.pinfo);
            else window.logger.log("sleeppreventer.js start() "+binaryName + " is already running.")
        },
        
        stop : function() {
            this.p.exit();
        }
    });
    var p_stdout = function (event) {
         if (this.p.standardOutput.bytesAvailable > 0) {
            this.traceString = this.p.standardOutput.readUTFBytes(this.p.standardOutput.bytesAvailable);
            window.logger.log("p.stdout = " + this.traceString);
        }
    };
    var p_stderr = function (event) {
        if (this.p.standardError.bytesAvailable > 0) {
            this.traceString = this.p.standardError.readUTFBytes(this.p.standardError.bytesAvailable);
            window.logger.log("p.stderr = " + this.traceString);
        }
    }
})();
