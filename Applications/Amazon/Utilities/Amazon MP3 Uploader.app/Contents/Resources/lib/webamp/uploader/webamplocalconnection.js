(function() {
    if (!this.hasOwnProperty("amznMusic")) {
        amznMusic = {};
    }
    
    amznMusic.air = amznMusic.air || {};
	amznMusic.uploader = amznMusic.uploader || {};
    amznMusic.uploader.WebampLocalConnection = Class.extend({
    
        init: function(args)
        {
           window.logger.log("webamplocalconnection.js init(args) args = " + [args].toString() );
           $.proxy(setupInvocationHandler,this)();
           $.proxy(setupReceiver,this)();
           $.proxy(setupSender,this)();
        },
        getCredentials: function(callback){
            window.logger.log("webamplocalconnection.js getCredentials(callback) " );
            $.proxy(setCallBack,this)(callback);
            $.proxy(getCreds,this)();
        }
    });
    
        var MAX_CONNECTION_COUNT = 30;
        
        var sender;
        var receiver;
        var callback;
        var currentCreds;
       
        var SEND_CHANNEL = "_webampReceive";
        var sendChannelCounter = 0;
        var sendChannelString = SEND_CHANNEL+sendChannelCounter;
        
        var receiveChannel = "_amu";
        var receiveChannelCounter = 0;
        var receiverClient;
        var reveiverChannelString;
        
        var invoked = false;
        var invokedWithArguments = false;
        var isLoopingForChannel = false;

        var setupInvocationHandler = function() {
            window.logger.log('webamplocalconnection.js setupInvocationHandler()');
            air.NativeApplication.nativeApplication.addEventListener(air.BrowserInvokeEvent.BROWSER_INVOKE,app_browserInvoke);
            air.NativeApplication.nativeApplication.addEventListener(air.InvokeEvent.INVOKE,app_browserInvoke);
        };
        
        var app_browserInvoke = function (event) {
            window.logger.log("webamplocalconnection.js app_browserInvoke called: " + event.type);
            clearTimeout(appInvokeTimer);
            if (invokedWithArguments) {
                window.logger.log("webamplocalconnection.js app_browserInvoke app already invoked with arguments returning");
                if (event && event.arguments && event.arguments.length > 0 && event.arguments[0]) {
                    window.logger.log("webamplocalconnection.js the arguments for this ignored invocation are = "+event.arguments.join(", "));
                }
                return;
            }
            invoked = true;
            if (event && event.arguments && event.arguments.length > 0 && event.arguments[0]) {
                window.logger.log("webamplocalconnection.js arguments = "+event.arguments.join(", "));
                //append an underscore because only alpha numeric chars are allowed
                sendChannelString = "_"+event.arguments[0];
                window.logger.log("webamplocalconnection.js sendChannelString = " + sendChannelString);
                invokedWithArguments = true;
                window.uploader.error = null;
                amznMusic.killState = false;
                window.logger.log("webamplocalconnection.js arguments found setting killState to false")
            } else {
                // we didn't launch amu from webamp... we launched it from the desktop
                isLoopingForChannel = true;
                sendChannelCounter = 0;
                sendChannelString = SEND_CHANNEL + sendChannelCounter;
                
                //disabled for now pending a fix to initial windows download fix
                //window.logger.log("webamplocalconnection.js no arguments found setting killState to true")
                //window.uploader.error = "Please launch the uploader from WebAMP."
                //amznMusic.killState = true;
            }

            $.proxy(getCreds,this)();
        };
        
        var setCallBack = function(funcObj) {
            callback = funcObj;
        };
        var setupSender = function () {
            if (!sender) {
                sender = new air.LocalConnection();
                sender.addEventListener(air.StatusEvent.STATUS, onStatus);
                sender.addEventListener(air.AsyncErrorEvent.ASYNC_ERROR, function(arg){
                    window.logger.log("webamplocalconnection.js sender_asyncError "+arg.toString())
                });
                sender.addEventListener(air.SecurityErrorEvent.SECURITY_ERROR, function(arg){
                    window.logger.log("webamplocalconnection.js sender_securityError"+arg.toString())
                });
            }
        };
        var setupReceiver = function() {
			if(!receiver) {
				receiver = new air.LocalConnection();
				receiver.allowDomain("*");
				receiver.addEventListener(air.AsyncErrorEvent.ASYNC_ERROR
                    ,function(e){
                        window.logger.log("webamplocalconnection.js receiver_asyncError() "+e.toString())
                    }
                );
				receiver.addEventListener(air.SecurityErrorEvent.SECURITY_ERROR
                    ,function(e){
                        window.logger.log("webamplocalconnection.js receiver_securityError() "+e.toString())
                    }
                );
                receiverClient = {};
				receiver.client = receiverClient;
                receiverClient.getCredentials_response = getCreds_response;
                receiverClient.webampLaunched = webampLaunched;
                var connected = false;
                while (!connected && receiveChannelCounter < MAX_CONNECTION_COUNT) {
                    try {
                        reveiverChannelString = receiveChannel + receiveChannelCounter++;
                        window.logger.log("webamplocalconnection.js reveiverChannelString = "+reveiverChannelString);
                        receiver.connect(reveiverChannelString);
                        window.logger.log("webamplocalconnection.js receiver listening on: "+reveiverChannelString)
                        connected = true;
                    }
                    catch (e) {
                        window.logger.log("webamplocalconnection.js failed on: "+reveiverChannelString+" - "+ e.message);
                        connected = false;
                    }
                }
            }
		};

        var appInvokeTimer = 0;
        var getCredsTimer = null;
        var getCreds = function() {
            if (!invoked) {
                window.logger.log("webamplocalconnection.js getCreds() app has not received invoke event yet... getCreds not called... starting timer")
                //fix for DMAMU-251
                //sometimes the invoke events never fire after launch from install
                //so here we set a timer to invoke the app if it's not invoked after 5 seconds
                appInvokeTimer = setTimeout(app_browserInvoke,3000,{});
                return;
            }
            window.logger.log("webamplocalconnection.js getCreds() about to get called...starting getCreds_timeout timer")
            getCredsTimer = setTimeout(getCreds_timeout, 1000);
            sender.send(sendChannelString, "getCredentials", reveiverChannelString);
        };

    var getCreds_timeout = function () {
            window.logger.log("webamplocalconnection.js getCreds_timeout()");
            if(!isLoopingForChannel) {
                window.logger.log("webamplocalconnection.js getCreds_timeout() after successful send. Did not get response.");
                window.uploader.error = "Authentication timed out. Please quit and try launching the Amazon MP3 Uploader again.";
                amznMusic.killState = true;
                callback(null);
            } else if (sendChannelCounter < MAX_CONNECTION_COUNT) {
                sendChannelString = SEND_CHANNEL + ++sendChannelCounter;
                window.logger.log("webamplocalconnection.js getCreds_timeout() - trying next channel: " + sendChannelString);
                amznMusic.killState = false;
                getCreds();
            } else {
                window.logger.log("webamplocalconnection.js getCreds_timeout() did not find an an open amu instance");
                window.uploader.error = "Authentication timed out. Please quit and try launching the Amazon MP3 Uploader again.";
                amznMusic.killState = true;
                callback(null);
            }
        };
        
        var getCreds_response = function (creds) {
            window.logger.log("webamplocalconnection.js getCreds_response(creds) received getCredentials response");
            if(getCredsTimer){
                clearTimeout(getCredsTimer);
            }
            if(!creds) {
                window.logger.log("webamplocalconnection.js getCreds_response(creds) creds received was null");
                return;
            }
            if(currentCreds && creds.tid == currentCreds.tid){
                //do nothing
                window.logger.log("webamplocalconnection.js getCreds_response(creds) creds received was same as current creds...ignoring");
            } else {
                amznMusic.air.creds = creds;
                currentCreds = creds;
                updateCreds(creds);
            }
            amznMusic.killState = false;
        };
        
        var updateCreds = function (creds) {
            callback(creds);
        };
        
        var webampLaunched  = function () {
            if(amznMusic.killState) {
                window.logger.log("webamplocalconnection.js amznMusic.killState == true");
                window.logger.log("webamplocalconnection.js window.uploader.error = "+window.uploader.error);
                window.logger.log("webamplocalconnection.js quitting amu");
				window.uploader.exit();
            }
        };

        var onStatus = function(event) {
            switch(event.level) {
                case "status" :
                    window.logger.log("webamplocalconnection.js send succeeded for getCreds on channel:"+sendChannelString);
                    isLoopingForChannel = false;
                    break;
                case "error" :
                    clearTimeout(getCredsTimer);
                    if (isLoopingForChannel && sendChannelCounter < MAX_CONNECTION_COUNT) {
                        sendChannelString = SEND_CHANNEL + ++sendChannelCounter;
                        getCreds();
                    } else {
                        window.logger.log("webamplocalconnection.js failed to find any amu instances open");
                        window.uploader.error = "";//default message
                        amznMusic.killState = true;
                        callback(null);
                    }
                    break;
               default :
                    window.logger.log("webamplocalconnection.js onStatus() " + event.level);
                    break;
            }
        }
 
})();
