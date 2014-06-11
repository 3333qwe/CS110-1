/*global amznMusic.uploader, jQuery, */
// Requires AIRAliases.js
// Requires jquery-1.4.2.js
// quick hack function for timing different discovery methods
function GetCurTime() {
    var curTime = new Date();
    return curTime.getTime();
}

(function($){
    amznMusic.uploader = amznMusic.uploader || {};

    var NUMBER_OF_SCANNERS = 3;
    var NUMBER_OF_SONGS_PER_CHUNK = 50;
    var playlistData = "";
    var wmpScanFinishedCounter = 0;
    
    //--------------------------------------
    //  Class WMPScanner
    //--------------------------------------
    amznMusic.uploader.WMPScanner = Class.extend({
        init: function(progressCallBack, playlistCallBack){
            this.progressCallBack = progressCallBack;
            this.playlistCallBack = playlistCallBack;
            this.wmpapiArray = [];
        },
        scanWMPLibrary: function(){
            var tryAgainError = false;
            for (var i = 0; i < NUMBER_OF_SCANNERS; i++) {
                var portSequence = 4242;
                do {
                    try {
                        this.beginWMPAPI(portSequence, i, this);
                    } catch (e) {
                        window.logger.log('wmpapi.js scanWMPLibrary() Scan WMP error: ' + e);

                        portSequence++;
                        var invalidSocketCheck = (e.toString().indexOf("invalid socket") !== -1 || e.toString().indexOf("Error #2002") !== -1);
                        if (invalidSocketCheck && portSequence < 4342) {
                            tryAgainError = true;
                            window.logger.log('wmpapi.js scanWMPLibrary() Scan WMP error: try again on ' + portSequence);
                            uploader.triggerEvent("SCAN_WMP_RETRY");
                        } else {
                            uploader.triggerEvent("SCAN_WMP_ERROR");
                            window.logger.log('wmpapi.js scanWMPLibrary() Scan WMP error...notifying');
                            this.stopWMPAPI(i);
                            break;
                        }
                    }
                } while (tryAgainError);
            }
        },
        beginWMPAPI: function (portSequence, portEnd, self) {
            if (!self.wmpapiArray[portEnd]) {
                self.wmpapiArray[portEnd] = new amznMusic.uploader.WMPAPI(portSequence + "" + portEnd, NUMBER_OF_SCANNERS, portEnd, NUMBER_OF_SONGS_PER_CHUNK);
                window.logger.log("wmpapi.js beginWMPAPI() adding a new instance to wmpapiArray");
                self.wmpapiArray[portEnd].setCallBacks(self.progressCallBack, self.playlistCallBack);
            }

            self.wmpapiArray[portEnd].fetchWMPLibraryAsJSON();
        },
        cancel: function(notify){
            if('undefined' === typeof notify){
                notify = true;
            }
            for (var i = 0; i < this.wmpapiArray.length; i++) {
                if(notify){
                    uploader.triggerEvent("SCAN_WMP_CANCEL");
                }
                window.logger.log("wmpapi.js cancel() calling cancel on wmpapi on port " + this.wmpapiArray[i].port);
                this.wmpapiArray[i].cancel();
            }
        },
        stopWMPAPI: function(portEnd){
            if (this.wmpapiArray[portEnd]) {
                this.wmpapiArray[portEnd].cancel();
            }
        },
        killWMPAPI: function(){
            this.cancel(false);
            var nativeProcessStartupInfo = new air.NativeProcessStartupInfo();
            var file = new air.File("c:\\Windows\\System32\\taskkill.exe");
            if(file.exists){
                try {
                    window.logger.log("wmpapi.js killWMPAPI attempting to terminate any wmpapi processes");
                    nativeProcessStartupInfo.executable = file;
                    var processArgs = new air.Vector["<String>"]();
                    processArgs.push("/f");
                    processArgs.push("/im");
                    processArgs.push("wmpapi.exe");
                    nativeProcessStartupInfo.arguments = processArgs;

                    var process = new air.NativeProcess();
                    process.start(nativeProcessStartupInfo);
                } catch (e) {
                    window.logger.log('wmpapi.js killWMPAPI: Couldnt run this process: ' + e);
                }
            }
        }
    });
    
    //--------------------------------------
    //  Class WMPAPI
    //--------------------------------------
    amznMusic.uploader.WMPAPI = Class.extend({
        init: function(port, numWorkers, workerIndex, numSongsPerChunk){
            this.port = port;
            this.numSongsPerChunk = numSongsPerChunk;
            this.workerIndex = workerIndex;
            this.numWorkers = numWorkers;
            this.socketConnectTimer = null;

            this.initProcess();
        },
        initProcess : function(){
            if (!this.process) {
                this.process = new air.NativeProcess();
                this.process.addEventListener(air.ProgressEvent.STANDARD_OUTPUT_DATA, wmpOutputDataHandler);
                this.process.addEventListener(air.ProgressEvent.STANDARD_ERROR_DATA, wmpErrorDataHandler);
                this.process.addEventListener(air.IOErrorEvent.STANDARD_OUTPUT_IO_ERROR, wmpIODataHandler);
                this.process.addEventListener(air.IOErrorEvent.STANDARD_ERROR_IO_ERROR, wmpIODataHandler);
            }

            if (!this.server) {
                this.serverSocketConnectCallback = $.proxy(serverSocket_connect, this);
                this.server = new air.ServerSocket();
                this.server.addEventListener(air.ServerSocketConnectEvent.CONNECT, this.serverSocketConnectCallback);
            }
        },

        fetchWMPLibraryAsJSON: function(){
            uploader.triggerEvent('SCAN_WMP_BEGIN', ['begin']);

            this.scanStart = GetCurTime();
            this.receivingPlaylistData = false;
            this.partialLine = "";
            playlistData = "";
            this.recordCount = 0;
            
            var nativeProcessStartupInfo = new air.NativeProcessStartupInfo();
            nativeProcessStartupInfo.executable = air.File.applicationDirectory.resolvePath("lib/wmpapi/WmpAPI.exe");
            var processArgs = new air.Vector["<String>"]();
            processArgs[0] = this.port;
            processArgs[1] = this.numWorkers;
            processArgs[2] = this.workerIndex;
            processArgs[3] = this.numSongsPerChunk;
            nativeProcessStartupInfo.arguments = processArgs;
            window.logger.log('wmpapi.js fetchWMPLibraryAsJSON() processArgs[0] = ' + processArgs[0]);

            this.initProcess();
            this.process.start(nativeProcessStartupInfo);

            window.logger.log("wmpapi.js fetchWMPLibraryAsJSON() this.server.listening=" + this.server.listening);
            window.logger.log("wmpapi.js fetchWMPLibraryAsJSON() this.server.bound=" + this.server.bound);
            //TODO:cmodien 
            // need to walk the ports here
            // if a port is in use we should just increment the port num
            // and try again
            if (!this.server.listening) {
                this.server.bind(this.port, "127.0.0.1");
                this.server.listen();
            }

            window.logger.log("wmpapi.js fetchWMPLibraryAsJSON() listening on port " + this.port);
            var self = this;
            this.socketConnectTimer = setTimeout(function () {
                window.logger.log('wmpapi.js No socket connection in 20 seconds, so cancelling process on port: ' + self.port);
                self.cancel(true);
            }, 20000);
        },

        cancel: function(notifyCancel){
            if (notifyCancel) {
                uploader.triggerEvent("SCAN_WMP_CANCEL");
            }
            this.tearDownProcess();
        },

        tearDownProcess : function(){
            //TODO:cmodien make this more robust
            //like after calling exit wait a few seconds for the exit event
            //if the event doesn't fire then call exit(true)
            //to force an exit
            //this may cause the ports that we're using for communication
            //to stay open though
            window.logger.log("wmpapi.js tearDownProcess() tearing wmpapi on port:" + this.port);
            if (this.process) {
                this.process.removeEventListener(air.ProgressEvent.STANDARD_OUTPUT_DATA, wmpOutputDataHandler);
                this.process.removeEventListener(air.ProgressEvent.STANDARD_ERROR_DATA, wmpErrorDataHandler);

                this.process.removeEventListener(air.IOErrorEvent.STANDARD_OUTPUT_IO_ERROR, wmpIODataHandler);
                this.process.removeEventListener(air.IOErrorEvent.STANDARD_ERROR_IO_ERROR, wmpIODataHandler);
                this.process.exit();
            }
            this.process = null;

            if (this.server) {
                if(this.serverSocketConnectCallback){
                    this.server.removeEventListener(air.ServerSocketConnectEvent.CONNECT, this.serverSocketConnectCallback);
                }
            }
            this.server = null;
            this.serverSocketConnectCallback = null;
        },
        
        setCallBacks: function(progressCallBack, playlistCallBack) {
            this.progressCallBack = progressCallBack;
            this.playlistCallBack = playlistCallBack
        }
    });
    
    
    //--------------------------------------
    //  Private Methods
    //--------------------------------------
    
    var serverSocket_connect = function(event){
        clearTimeout(this.socketConnectTimer);
        this.incomingSocket = event.socket;
        this.incomingSocket.addEventListener(air.ProgressEvent.SOCKET_DATA, $.proxy(serverSocket_socketData, this));
        this.incomingSocket.addEventListener(air.Event.CLOSE, $.proxy(serverSocket_socketClose, this));
        window.logger.log("wmpapi.js serverSocket_connect() connected on port: " + this.port);
    };

    var serverSocket_socketClose = function(event){

        wmpScanFinishedCounter = ++wmpScanFinishedCounter;
        window.logger.log("wmpapi.js serverSocket_socketClose(event) scanned " + this.recordCount + " files in " + (GetCurTime() - this.scanStart) + " milliseconds on port: " + this.port);
        if (wmpScanFinishedCounter >= NUMBER_OF_SCANNERS) {
            setTimeout($.proxy(parsePlaylistData, this)(),1000);
            wmpScanFinishedCounter = 0;
        }
        this.tearDownProcess();
        uploader.triggerEvent("SCAN_WMP_END");
        window.logger.log("wmpapi.js serverSocket_socketClose(event) connection closed on port: " + this.port);
    };
    
    var wmpOutputDataHandler = function(event){
        outputHandler(event.type, event.target.standardOutput);
    };

    var wmpErrorDataHandler = function(event){
        outputHandler(event.type, event.target.standardError);
    };

    var wmpIODataHandler = function(event){
        window.logger.log("wmpapi.js wmpIODataHandler  = "+ event.toString())
    };

    var outputHandler = function(handlerType, dataOutput){
        if (dataOutput.bytesAvailable > 0) {
            var outputString = dataOutput.readUTFBytes(dataOutput.bytesAvailable);
            window.logger.log("wmpapi.js outputHandler " + handlerType + " = "+outputString)
        }
    };
    
    var serverSocket_socketData = function(event){

        if (this.incomingSocket.bytesAvailable > 0) {
            var buf = this.incomingSocket.readUTFBytes(this.incomingSocket.bytesAvailable);
            //window.logger.log("Recieved " + buf.length + " bytes on port:" + this.port);
            //check for the playlist token
            //if it exists 
                //process playlist data from now on
                //split the current string on the token
                //pass the first part to the song callback
                //pass the second part to the playlist callback
            //else just process song data
            if (this.receivingPlaylistData) {
                window.logger.log("wmpapi.js serverSocket_socketData(event) receivingPlaylistData on port: " + this.port);
                playlistData += buf;
            }
            else {
                if (buf.indexOf("@@playlistdata@@") != -1) {
                    window.logger.log("wmpapi.js serverSocket_socketData(event) found playlistdata on port: " + this.port);
                    this.receivingPlaylistData = true;
                    var dataArray = buf.split("@@playlistdata@@");
                    $.proxy(processSongData,this)(dataArray[0]);
                    playlistData += dataArray[1];
                }
                else {
                    $.proxy(processSongData,this)(buf);
                }
            }
            
        }
    };
    
    // incremental parsing of the JSON Data, each line of the input data is a JSON object
    // lines may be broken across buffers, so detect and save partial lines and reconstruct later.
    var processSongData = function(jsonData){
        var matches = [];
        var patt = /\s*\(\s*(\{.+?\})\s*\)/gm;
        var songs = [];
        patt.compile(patt);
        
        //test for partial data at the beginning of the string
        matches = patt.exec(jsonData);
        if (matches && matches.index != 0) {
            this.partialLine += jsonData.substring(0,matches.index);
             //reset the seek index
            patt.lastIndex = 0;
            if(matches = patt.exec(this.partialLine)) {
                songs.push($.proxy(processWmpJson,this)(matches[1]));
                this.partialLine = "";
            }
        }
        
        //reset the seek index
        patt.lastIndex = 0;
        var lastIndex = 0;
        while(matches = patt.exec(jsonData)) {
            songs.push($.proxy(processWmpJson,this)(matches[1]));
            lastIndex = patt.lastIndex;
        }
        
        //test for partial data at the end of the string
        if (lastIndex != jsonData.length) {
            this.partialLine += jsonData.substring(lastIndex,jsonData.length);
        }
        uploader.triggerEvent("SCAN_WMP_PROGRESS", ['scanned', songs]);
        this.progressCallBack(songs);
    };
    
    var processWmpJson = function(songJson){
        var itemEntry = JSON.parse(songJson);
        var returnVal;
        if ((typeof itemEntry != "undefined") && (typeof itemEntry.SourceURL != "undefined")) {
            this.recordCount++;
            /*
             local file path = "SourceURL",
             size = "FileSize",
             isPodcast = itemEntry["WM/Genre"] == "Podcast",
             isDRM = "Is_Protected",
             artist = "WM/AlbumArtist",
             albumArtist = "WM/AlbumArtist",
             album = "WM/AlbumTitle",
             track name = "Title",
             track number = "WM/TrackNumber",
             duration = "Duration",
             date added  = "AcquisitionTime",
             format = "FileType",
             id = "SourceURL"
             */

            returnVal = {
                path: itemEntry.SourceURL,
                fileName: itemEntry.SourceURL.substring(itemEntry.SourceURL.lastIndexOf("\\"), itemEntry.SourceURL.length),
                size: itemEntry.FileSize,
                title: itemEntry.Title,
                artist: itemEntry["Author"],
                albumArtist: itemEntry["WM/AlbumArtist"],
                album: itemEntry["WM/AlbumTitle"],
                //isDRM: (itemEntry["Is_Protected"] !== 'False' && itemEntry["Is_Protected"] !== 'false'), removing because anything protected in WMP will be an unsupported file format
                isPodcast: itemEntry["WM/Genre"].toLowerCase() == "podcast",
                trackNumber: itemEntry["WM/TrackNumber"],
                duration: itemEntry["Duration"],
                dateAdded: itemEntry["AcquisitionTime"],
                format: itemEntry["FileType"],
                id: uploader.childInterface.removeBadChars(itemEntry["SourceURL"])
            };
            return returnVal;
        }
        else {
            alert("failed to parse wmp song");
        }
    };
    
    var parsePlaylistData = function () {
        if(!playlistData || playlistData == "") return;
        var playlists = [];
        var patt2 = /\s*\(\s*(\{.+?\})\s*\)/gm;
        patt2.compile(patt2);
        var matches2 = [];
        var playlistJson = "";
        var playlist;
        while (matches2 = patt2.exec(playlistData)) {
            playlistJson = matches2[1];
            playlist = JSON.parse(playlistJson);
            if ((typeof playlist != "undefined") && (typeof playlist.name != "undefined")) {
                //change the id's for all the songs
                for (var i = 0; i < playlist.songs.length; i++) {
                    playlist.songs[i].id = uploader.childInterface.removeBadChars(playlist.songs[i].id);
                }
                playlists.push(playlist);
            } else {
                window.logger.log("wmpapi.js parsePlaylistData() Error failed to parse wmp playlist... playlistData = " + playlistData);
            }
        }
        window.logger.log("wmpapi.js parsePlaylistData() found " +playlists.length+ " playlists");
        this.playlistCallBack(playlists);
        playlistData = "";
    }
})(jQuery);
