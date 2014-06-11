(function($){

    window.uploader = function(){
        var base = {};

	    base.airWrapper = null;
	    base.service = {};
		base.error = null;
		var _iTunesXML;
		var _checkFile = new air.File();  // to see if the file exists
		var _cancelRequested = false;

        // This is the only place that these should be defined.
        var _supportedAudioFilesExtensions = ['mp3', 'm4a', 'aac'];
        var _supportedUploadHostnames = ['s3.amazonaws.com',
                                        's3-us-west-1.amazonaws.com',
                                        's3-eu-west-1.amazonaws.com',
                                        's3-ap-southeast-1.amazonaws.com',
                                        's3-external-1.amazonaws.com',
                                        's3-ap-northeast-1.amazonaws.com'
                                        ];

        base.parentInterface = {
            UPDATE_CHECK_COMPLETE: "UPDATE_CHECK_COMPLETE",

            trace: function(str){
                window.logger.log(str);
            },
	        prompt: function(question, defaultAnswer) {
		        window.logger.log("bridge.js prompt(question, defaultAnswer) = " + [question, defaultAnswer].toString() );
		        window.prompt(question, defaultAnswer);
	        },
            setKillState : function(shouldKill) {
                amznMusic.killState = shouldKill;
            },
            preventSleep: function() {
                try {
                    if(!this.sleepPreventer) {
                        window.logger.log("bridge.js preventSleep() making a new preventer");
                        this.sleepPreventer = new amznMusic.uploader.SleepPreventer();
                    }
                    this.sleepPreventer.start();
                } catch (e) {}
            },
            allowSleep: function() {
                if(this.sleepPreventer) {
                    this.sleepPreventer.stop();
                } else {
                    window.logger.log("bridge.js allowSleep() sleepPreventer was null aborting call");
                }
            },
			isUpdating: function () {
				return amznMusic.uploader.checkingForUpdates;
			},
            hasError: function () {
                window.logger.log("bridge.js hasError() args = " + [].toString() );
                return this.getError() != null;
            },
            getError: function () {
                window.logger.log("bridge.js getError() args = " + [].toString() );
                return uploader.error;
            },
			upload: function( song, response, callback ) {
				window.logger.log("bridge.js upload( song, response ) args = " + [ song, response ].toString() );
				if (!base.airWrapper) {
					base.airWrapper = new amznMusic.uploader.bridge.Air(base.childInterface);
				}

                var triggerSecurityError = false;
                if(!this.isSupportedAudioFile(song.path)){
                    window.logger.log("ERROR: Attempting to upload track not in whitelist: " + song.path);
                    triggerSecurityError = true;
                }

                var url = response.getUploadUrlResponse.getUploadUrlResult.uploadRequest.endpoint;
                if(!this.isSupportedEndpoint(url)){
                    window.logger.log("ERROR: Attempting to upload endpoint not in whitelist: " + url);
                    triggerSecurityError = true;
                }

				base.airWrapper.upload( song, response, triggerSecurityError, callback );
			},
            cancelUpload: function () {
                window.logger.log("bridge.js cancelUpload() args = " + [].toString() );
                base.airWrapper.cancelUpload = true;
            },
            testNetworkAvailability : function (callback){
				if (!base.airWrapper) {
					base.airWrapper = new amznMusic.uploader.bridge.Air(base.childInterface);
				}
                base.airWrapper.testNetworkAvailability(callback);
            },
            fileExists: function(path) {
                var retVal = false;
                if(this.isSupportedAudioFile(path)){
                    try{
                        _checkFile.nativePath = path;
                        retVal = _checkFile.exists;
                    }catch(error){
                        window.logger.log("bridge.js fileExists() threw error: " + error);
                    }
                }
                return retVal;
            },
            isDirectory: function(path) {
                window.logger.log("bridge.js isDirectory(path) args = " + [path].toString() );
                _checkFile.nativePath = path;
                return _checkFile.isDirectory;
            },
            browseForDirectory: function(cancelCallback){
                window.logger.log("bridge.js browseForDirectory() args = " + [].toString() );
                var file = new air.File();
                file.addEventListener(air.Event.SELECT, dirSelected);
                file.addEventListener(air.Event.CANCEL, dirCancelled);

                file.browseForDirectory("Select a Folder");
                function dirSelected(e){
                    file.removeEventListener(air.Event.SELECT, dirSelected);
                    file.removeEventListener(air.Event.CANCEL, dirCancelled);
                    $('#MP3_UI').bind('SCAN_DIRECTORY_CANCEL', cancelDirectoryScan);
                    base.childInterface.triggerEvent('SCAN_DIRECTORY_BEGIN', ['begin']);
                    _cancelDirectoryScanDetected = false;
                    _clearFileList();

                    _baseDirectoryScanning = file.nativePath;

					setTimeout(function(){ // give the UI a chance to update
                        getFilesAsync(file.nativePath);
					}, 600);
                }

                function dirCancelled(e){
                    file.removeEventListener(air.Event.SELECT, dirSelected);
                    file.removeEventListener(air.Event.CANCEL, dirCancelled);
                    if('function' === typeof cancelCallback){
                        cancelCallback();
                    }
                }
            },
            // Define the audio files supported by the uploader
            isSupportedAudioFile : function(filePath) {
                var path = String(filePath);
                if (path.length) {
                    var extension = path.split('.').pop().toLowerCase();
                    return (_supportedAudioFilesExtensions.indexOf(extension)>=0);
                }
                return false;

            },
            isSupportedEndpoint : function(url){
                if(url.substr(0,8).toLowerCase() === 'https://'){
                    var hostname = url.substr(8)
                    var pos = url.indexOf('/', 8);
                    if(pos>0){
                        hostname = url.substring(8, pos).toLowerCase();
                    }

                    for(var x=0;x<_supportedUploadHostnames.length;x++){
                        var pattern = _supportedUploadHostnames[x];
                        var d = hostname.length - pattern.length;
                        if(d >= 0 && hostname.indexOf(pattern, d) === d){//endsWith
                            return true;
                        }
                    }
                }
                return false;
            },
            getITunesLibraryData: function(){
                window.logger.log("bridge.js getITunesLibraryData() args = " + [].toString() );

                //assume we are restarting scans...
                _cancelRequested = false;

                var file = new air.File();
                var foundITunesXML = false;
                var iTunesXMLFileName = "iTunes Music Library.xml";
                var searchDirs = [
                    air.File.userDirectory.nativePath
                    ,air.File.documentsDirectory.nativePath
                ];
                var searchPaths = [
                    "/Music/iTunes/"
                    ,"/My Music/iTunes/"
                ];
                for (var i = 0; i < searchDirs.length && !foundITunesXML; i++) {
                    for (var j = 0; j < searchPaths.length && !foundITunesXML; j++) {
                        file = file.resolvePath(searchDirs[i]+searchPaths[j]+iTunesXMLFileName);
                        if(file.exists) {
                            foundITunesXML = true;
                            break;
                        }
                    }
                }

                if (foundITunesXML) {
                   window.logger.log("fetching iTunes library from: " + file.nativePath);
                   var stream = new air.FileStream();
                    stream.open(file, air.FileMode.READ);
                    _iTunesXML = stream.readUTFBytes(stream.bytesAvailable);
                    stream.close();
                    stream = null;
                    window.logger.log("retrived iTunesXML");
                    try {
                        var domParser = new DOMParser(); // test to see if this works in IE
                        _iTunesXML = domParser.parseFromString(_iTunesXML, "text/xml");
                        domParser = null;
                        window.logger.log("parsed iTunesXML");
                        base.childInterface.triggerEvent('SCAN_ITUNES_BEGIN', ['begin']);
						window.logger.log("starting iTunesXML processing");
                        setTimeout(parseITunesXMLTrain, 600);
                    } catch (e) {
                        window.logger.log("error scanning iTunes: " + e.toString());
                        var errorString = base.childInterface.getString('dmusic_uploader_parse_itunes_xml') === '' ? 'We couldn\'t seem to parse your "iTunes Music Library.xml" file' : base.childInterface.getString('dmusic_uploader_parse_itunes_xml');
                        base.childInterface.triggerEvent('ERROR_PARSE_ITUNES_XML', [errorString]);
                    }
                } else {
                    var errorString = base.childInterface.getString('dmusic_uploader_missing_itunes_xml') === '' ? 'Your "iTunes Music Library.xml" file appears to be missing.' : base.childInterface.getString('dmusic_uploader_missing_itunes_xml');
                    base.childInterface.triggerEvent('ERROR_MISSING_ITUNES_XML', [errorString]);
                }
            },
            scanITunes: function() {
                //window.logger.log("bridge.js scanITunes() args = " + [].toString() )
                _processNextITunesCar();
            },
            scanWMPLibrary : function(progressCallBack, playlistCallback) {
                window.logger.log("bridge.js scanWMPLibrary(progressCallBack, playlistCallback) args = " + [progressCallBack, playlistCallback].toString() );
                if(!this.wmpScanner)
                    this.wmpScanner = new amznMusic.uploader.WMPScanner(progressCallBack, playlistCallback);
                this.wmpScanner.scanWMPLibrary();
            },
            cancelScans : function () {
                window.logger.log("bridge.js cancelScans() args = " + [].toString() );
                _cancelRequested = true;
                if(currentITunesTask) clearTimeout(currentITunesTask);
                if(this.wmpScanner) this.wmpScanner.cancel();

            },
            getCreds : function (getCreds_response) {
                window.logger.log("bridge.js getCreds(getCreds_response) args = " + [getCreds_response].toString() );
                if(!this.webampConnection) this.webampConnection = new amznMusic.uploader.WebampLocalConnection();
                this.webampConnection.getCredentials(getCreds_response);
            },
            saveData : function (type, data, callback) {
	            window.logger.log("bridge.js saveData(type, data, callback) args = " + [type, callback].toString() );
	            if (amznMusic.air.creds) {
                    amznMusic.air.database.saveData(type, amznMusic.air.creds.customerId, data, callback);
	            } else {
		            if (callback) callback(null);
	            }
            },
            getSavedData : function (type, callback) {
                window.logger.log("bridge.js getSavedData(type, callback) args = " + [type, callback].toString() );
                if (amznMusic.air.creds) {
                    amznMusic.air.database.getSavedData(type, amznMusic.air.creds.customerId, callback);
                } else {
	                if (callback) callback(null);
                }
            },
            saveSong: function (songData, callback) {
                if (songData) {
                    amznMusic.air.database.saveSong(
                          amznMusic.air.creds.customerId,
                          songData,
                          callback
                    );
                }
            },
            getSavedSong: function (songId, callback) {
                return amznMusic.air.database.getSavedSong(amznMusic.air.creds.customerId, songId, callback);
            },
            triggerEvent: function(eventType, paramArray) {
                window.logger.log("bridge.js triggerEvent(eventType, paramArray) args = " + [eventType, paramArray].toString() );
                $('#MP3_UI').trigger(eventType, paramArray);
            },
            copyToClipboard: function(data) {
                window.logger.log("bridge.js copyToClipboard(data) args = " + [data].toString() );
                air.Clipboard.generalClipboard.setData(air.ClipboardFormats.TEXT_FORMAT, data);
            },
	        getNumberOfPreviouslyScannedFolders: function() {
		        window.logger.log("bridge.js getNumberOfPreviouslyScannedFolders() args = " + [].toString() );
		        return _numberOfPreviouslyScannedFolders;
	        },
            close : function () {
               window.logger.log("bridge.js close() args = " + [].toString() );
               var closingEvent = new air.Event(air.Event.CLOSING,true,true);
               window.nativeWindow.dispatchEvent(closingEvent);
               if(!closingEvent.isDefaultPrevented()){
                   window.nativeWindow.close();
                   return true;
               } else {
                   return false;
                }
            },
            killWMPAPI: function () {
                if(this.wmpScanner){
                    this.wmpScanner.killWMPAPI();
                }
            },
            exit : function () {
                this.killWMPAPI();
                window.logger.log("bridge.js exit() args = " + [].toString() );
                base.exit();
            },
            setLogTruncation: function (v) {
                window.logger.log("bridge.js setLogTruncation(v) args = " + [v].toString() );
                // shouldTruncate is boolean
                window.logger.shouldTruncate = v;
            },
            log : function(message) {
                window.logger.log(message);
            },
            dataError : function(request, response) {
                window.logger.dataError(request, response);
            },
            dataDebug : function(output, groupName, info){
                window.logger.dataDebug(output, groupName, info);
            },
            getAppVersion: function () {
                return window.updater.getCurrentVersion();
            },
            setMemoryProfilingEnabled : function (val) {
                window.logger.memoryProfilingEnabled = val;
            },
            startMp3UI: function () {
                $('body').addClass('startedMp3');
            },
            getDMID: function (filePath) {
                _dmidFile.nativePath = filePath;

                return getDMID(_dmidFile);
            },
            beginUploading: function () {
                window.nativeWindow.removeEventListener("closing",app_closing);
                window.nativeWindow.addEventListener("closing",app_closing);
            },
            endUploading: function () {
                window.nativeWindow.removeEventListener("closing",app_closing);
            }
        };

        var _dmidFile = new air.File();

        base.exit = function () {
            window.logger.log("exiting the app");
            setTimeout(air.NativeApplication.nativeApplication.exit,200);
        };

        var app_closing = function (event) {
            if(base && base.childInterface && base.childInterface.triggerEvent && !amznMusic.killState) {
                event.preventDefault();
                base.childInterface.triggerEvent("CLOSING");
                base.parentInterface.allowSleep();
            }
        };

        var app_activate = function (event) {
            if(base.childInterface && base.childInterface.triggerEvent) {
                base.childInterface.triggerEvent('APP_ACTIVATE');
            }
        };

        air.NativeApplication.nativeApplication.addEventListener(air.Event.ACTIVATE,app_activate);

        var _cancelDirectoryScanDetected = false;
        var _currentDirectoryScanning = null;
        var _baseDirectoryScanning = null;

        var cancelDirectoryScan = function () {
            _cancelDirectoryScanDetected = true;
            $('#MP3_UI').unbind('SCAN_DIRECTORY_CANCEL', cancelDirectoryScan);
            if(_currentDirectoryScanning){
                _currentDirectoryScanning.cancel();
            }
            base.childInterface.triggerEvent('SCAN_DIRECTORY_CANCEL', [_baseDirectoryScanning]);
        };

        var sequenceNumCounter = 0;
        var _fileList = [];
	    var _numberOfPreviouslyScannedFolders = 0;
		var getFilesAsync = function(directoryPath) {
			_numberOfPreviouslyScannedFolders = 0;
            var directory = new air.File(directoryPath);
			if (directory.exists) {
                _getFilesInDirs([directory]);
			}
		};

        var _getFilesInDirs = function(dirs){

			_numberOfPreviouslyScannedFolders++;

            var dir = dirs.shift();
            dir.addEventListener(air.FileListEvent.DIRECTORY_LISTING, function processDirContents(event){
                event.target.removeEventListener(air.FileListEvent.DIRECTORY_LISTING, processDirContents);

            var contents = event.files;

                //start processing the first batch of files, pass in a callback for when all processing is done
                processFilesWithYield(contents, dirs, function(){
                    if(dirs.length==0){
                        //...no more dirs to process...notify
                        _currentDirectoryScanning = null;
                        base.childInterface.triggerEvent('SCAN_DIRECTORY_END', [_baseDirectoryScanning, _fileList]);
                        return;
                        }
                    //continue with the next dir in the stack
                    _getFilesInDirs(dirs);
                });

            });
            base.childInterface.triggerEvent('SCAN_DIRECTORY_PROGRESS', [dir.nativePath]);
            dir.getDirectoryListingAsync();
            _currentDirectoryScanning = dir;
        };

        var processFilesWithYield = function(files, dirStack, completeCallback){

            //hit the callback if no more files to process...
            if(!files.length){
                completeCallback();
                return;
					}

            if(_cancelDirectoryScanDetected){
                return;
                }

            //process in 100 file increments...
            var max = (files.length>=100)?100:files.length;
            for(var i=0;i<max;i++){
                var file = files.shift();
                if (file.exists && !file.isHidden && !file.isSymbolicLink && !file.isPackage) {
                    if (file.isDirectory) {
                        dirStack.push(file);//...push dirs into stack, process after files
                    }else if (base.childInterface.isAudioFile(file.nativePath)) {
                        _addFile(file);
                    }
			    }
            }

            setTimeout(function(){
                processFilesWithYield(files, dirStack, completeCallback);
            }, 0);
		};


        var _addFile = function(file){
            var sequenceNum = "file" + sequenceNumCounter;
            var fileName = file.name;
            var fileSize;
            try{
                fileSize = file.size;
            }catch(error){
                //permission problems will throw an error
                return;
            }
            var fileNativePath = file.nativePath;
            var fileParent = file.parent.name;
            var isLossless = _isLossless(file);
            var kind = "";
            if(isLossless) kind = "Apple Lossless audio file";
            sequenceNumCounter++;

            _fileList.push({
                sequenceNum: sequenceNum,
                name: fileName,
                size: fileSize,
                nativePath: fileNativePath,
                parent: fileParent,
                kind: kind
            });
        };

        var fs = new air.FileStream();
        var lowerBounds = 350;
		var upperBounds = 500;
		var fileParts;
        var a = 97;
		var l = 108;
		var c = 99;
		var _isLossless = function(file) {
            fileParts = file.nativePath.split(".");
			if (fileParts.length > 0 && fileParts[fileParts.length - 1] == "m4a") {
                fs.open(file, air.FileMode.READ);
                //jump to where the first instance of alac is detected
                fs.position = lowerBounds;
                //scan the file until we find "alac"
                while (fs.position < upperBounds) {
                    if (fs.readUnsignedByte() == a &&
                    fs.readUnsignedByte() == l &&
                    fs.readUnsignedByte() == a &&
                    fs.readUnsignedByte() == c) {
                        return true;
                    }
                }
                fs.close();
            }
			//air.trace("debugCharCodes = " + debugCharCodes);
			return false;
		};

        var _id3header = null;
        var _commentData = null;
        var getDMID = function (file) {
            if ( !file ) { return ""; }
			var result = "";

            fileParts = file.nativePath.split(".");
            var dmid = [];
			if (fileParts.length > 0 && fileParts[fileParts.length - 1] == "mp3") {
				try {
					fs.open(file, air.FileMode.READ);
				}
				catch (e) {
					window.logger.log("caught exception " + e + " trying to open " + file.nativePath);
					return "";
				}

                fs.position = 0;

                if (!_id3header) {
                    _id3header = new air.ByteArray();
                    _commentData = new air.ByteArray();
                } else {
                    _id3header.clear();
                }

                fs.readBytes(_id3header, 0, 10);
				var tag = _id3header.readUTFBytes(3); // header tag is 3 chars
				var tagSize = 0;
				var frameSize = 0;
				if (tag === "ID3") {
					// skip version and unsync flag >
					var version = _id3header.readUnsignedByte();
					if (version != 3) {
						fs.close();
						return "";
					}

					_id3header.readUnsignedByte();
					var flags = _id3header.readUnsignedByte();
					if (flags > 127) {
						// We explicitly never write unsynchronized tags
						// presumably because lots of player don't handle them
						// If we see the unsynch flag, then it didn't come from us
						fs.close();
						return "";
					}

					// tag size is weird format 4 7 bit digits
					tagSize = _id3header.readUnsignedByte()*128*128*128;
					tagSize += _id3header.readUnsignedByte()*128*128;
					tagSize += _id3header.readUnsignedByte()*128;
					tagSize += _id3header.readUnsignedByte();

					var foundDMID = false;
					do {
					    // each frame past the header has:
						// 4 chars label
						// 4 byte size (32bit int)
						// 2 bytes flags
						_id3header.clear();
						fs.readBytes(_id3header, 0, 10);
						tag = _id3header.readUTFBytes(4); //remaining tags are 4 chars
						frameSize = _id3header.readUnsignedInt();
						// check for comment frame
						if (tag === "COMM") {
							_commentData.clear();
							fs.readBytes(_commentData, 0, frameSize);

							var commentStr;
							if (_commentData[4] === 0) {
								// non-unicode
								_commentData.position = 5;
								commentStr = _commentData.readUTFBytes(_commentData.bytesAvailable);
							}
							else if ((_commentData[4] === 255) && (_commentData[5] === 254)) {
								// unicode
								_commentData.position = 10;
								commentStr = _commentData.readMultiByte(_commentData.bytesAvailable, "unicode");
							}

							if (commentStr && commentStr.indexOf("Amazon.com Song ID: ") === 0) {
								foundDMID = true;
								result = commentStr.substr(20);
								//window.logger.log("Found DMID : " + result + " in " + file.nativePath);
							}
						}
						else {
						    // skip uninteresting frames
							fs.position = fs.position + frameSize;
						}
					} while (!foundDMID && (fs.position < tagSize) && frameSize !=0);

				}

                fs.close();
            }

			return result;
        };

        var _clearFileList = function(){
            _fileList = [];
            sequenceNumCounter = 0;
        };

        var _iTunesSongs = [];
        var _iTunesPlaylists = [];
		var totalSongs = 0;
		var _iTunesTrain = [];
        var carSize = 10;
        var carCounter = 0;
		var currentITunesTask = undefined;
        // utility file to convert file URL to a native file path
        var convertorFile = new air.File();
        var parseITunesXMLTrain = function(){
			_iTunesSongs = [];
			_iTunesTrain = [];
            var result = {};
            var topLevelDict = $(_iTunesXML).children().children().first();
            result.iTunesVersion = topLevelDict.children('key:contains("Application Version")').first().next().text();
            result.musicFolder = topLevelDict.children('key:contains("Music Folder")').first().next().text();
            var airMusicFolder = new air.File(result.musicFolder);
            if (!airMusicFolder.exists) {
                var errorString = base.childInterface.getString('dmusic_uploader_missing_itunes_music') === '' ? "We can't seem to find your music files." : base.childInterface.getString('dmusic_uploader_missing_itunes_music');
                base.childInterface.triggerEvent('ERROR_MISSING_ITUNES_MUSIC', [errorString]);
                return result;
            }

            convertorFile.url = result.musicFolder;
            result.musicFolder = convertorFile.nativePath;
            var selector = $(_iTunesXML).find('dict > dict > dict'); // scan the songs
            // ok, we've got all the songs, so break them up into pieces
            var iTunesSongArray = selector.toArray();
			totalSongs = iTunesSongArray.length;
            window.logger.log("parsing itunes songs " + carSize + " at a time");
			var numChunks = totalSongs / carSize;
			var startIndex = 0;
			var endIndex = carSize;
			carCounter = 0;
			for (var i = 0; i < numChunks; i++) {
				var car = iTunesSongArray.slice(startIndex, endIndex);
				if (car) {
                    _iTunesTrain.push(car);
                    startIndex += carSize;
                    endIndex += carSize;
				}
			}
			_parseITunesPlaylists(_iTunesXML);
			if (totalSongs > 0) {
				// kick off the incremental scan
                _processNextITunesCar();
			} else {
               endITunesScan();
            }
        };

        var endITunesScan = function () {
            base.childInterface.triggerEvent('SCAN_ITUNES_END', ['end', _iTunesSongs, _iTunesPlaylists]);
            _iTunesSongs = null;
            _iTunesXML = null;
            _iTunesTrain = null;
            _iTunesPlaylists = null;
        }

		var _processNextITunesCar = function() {
            if(currentITunesTask) clearTimeout(currentITunesTask);
            if(_cancelRequested) return;
			currentITunesTask = setTimeout(function() {
                var car = _iTunesTrain[carCounter];
				if (carCounter < _iTunesTrain.length - 1) {
                    var progressString = 'done';
					if (car && car[0]) {
                        progressString = $(car[0]).children('key:contains("Name")').first().next().text();
					}
                    var lastSong = _iTunesSongs[_iTunesSongs.length-1];
                    base.childInterface.triggerEvent('SCAN_ITUNES_PROGRESS', [progressString, [lastSong]]);
				}
                _processITunesCar(car);
                // are we done
                carCounter++;
                if (carCounter === _iTunesTrain.length) {
                  endITunesScan();
                }
			}, 1);
		};

		var _processITunesCar = function(car) {
            jQuery.each(car, function(index, value) {
                try {
                    _parseITunesSongXML(value);
                } catch (e) {
                    window.logger.log("exception processing iTunes car = " + e);
                }
            });
		};

		var _parseITunesSongXML = function(iTunesSongXML) {
                var file = {};
                file.path = $(iTunesSongXML).children('key:contains("Location")').first().next().text();
                // convert to a native file path if its a local file
                if(file.path.substr(0,5) !== "file:"){
                    return;
                }
                convertorFile.url = file.path;
                file.path = convertorFile.nativePath;
                if (base.childInterface.isAudioFile(file.path)) {
                    var pathArray = file.path.split("/");
                    file.fileName = pathArray.pop();
                    file.parent = pathArray.pop();
                    file.artist = $(iTunesSongXML).children('key:contains("Artist")').first().next().text();
                    file.album = $(iTunesSongXML).children('key:not(:contains("Album Artist"))').filter(':contains("Album")').first().next().text();
                    file.size = $(iTunesSongXML).children('key:contains("Size")').first().next().text();
                    file.dateAdded = $(iTunesSongXML).children('key:contains("Date Added")').first().next().text();
                    file.title = $(iTunesSongXML).children('key:contains("Name")').first().next().text();
                    file.trackId = $(iTunesSongXML).children('key:contains("Track ID")').first().next().text();
                    file.id = $(iTunesSongXML).children('key:contains("Persistent ID")').first().next().text();
                    file.kind = $(iTunesSongXML).children('key:contains("Kind")').first().next().text();
                    file.trackNumber = $(iTunesSongXML).children('key:contains("Track Number")').first().next().text();
                    file.diskNumber = $(iTunesSongXML).children('key:contains("Disk Number")').first().next().text();
                    file.totalTime = $(iTunesSongXML).children('key:contains("Total Time")').first().next().text();
                    if ($(iTunesSongXML).children('key:contains("Album Artist")').size() > 0) {
                        file.albumArtist = $(iTunesSongXML).children('key:contains("Album Artist")').first().next().text();
                    }
                    file.isPodcast = ($(iTunesSongXML).children('key:contains("Podcast")').size() > 0);
                    file.isCompilation = ($(iTunesSongXML).children('key:contains("Compilation")').size() > 0);
                    file.isDRM = ($(iTunesSongXML).children('key:contains("Protected")').size() > 0);

                    _iTunesSongs.push(file);
                }
		};

		var _parseITunesPlaylists = function(_iTunesXML) {
			_iTunesPlaylists = [];
            var selector = $(_iTunesXML).find('key:contains("Playlists") + array > dict');
            selector.each(function() {
                //skip system playlists - allow user created and smart playlist through
                if (!$(this).children('key:contains("Master")').size() > 0 &&
                    !$(this).children('key:contains("Distinguished Kind")').size() > 0) {

                    var playlist = {};
                    playlist.name = $(this).children('key:contains("Name")').first().next().text();
                    playlist.id = $(this).children('key:contains("Persistent ID")').first().next().text();

                    if ($(this).children('key:contains("Smart Info")').size() > 0) {
                        playlist.isSmartList = true;
                        playlist.source = "iTunes";
                    }

                    var songs = [];
                    var songSelector = $(this).find('array > dict');
                    songSelector.each(function() {
                        var song = {};
                        song.trackId = $(this).children('key:contains("Track ID")').first().next().text();
                        songs.push(song);
                    });
                    playlist.songs = songs;
                    _iTunesPlaylists.push(playlist);
                }
            });
		};

        base.createBridge = function(childElement){
            if (childElement) {
                childElement.contentWindow.parentSandboxBridge = base.parentInterface;
            }
            else {
                window.logger.log('no childElement');
            }
        };

        base.childInterface = {};

        base.doLoad = function(childElement){
			if(base.parentInterface.isUpdating()) {
				window.logger.log("bridge.js base.doLoad() still performing updateCheck waiting till it's finished.");
				return;
			}
            if (childElement) {
                base.childInterface = childElement.contentWindow.childSandboxBridge;

                if(base.childInterface && base.childInterface.publish) {
                    amznMusic.air.database = new amznMusic.air.Database();
                    amznMusic.air.database.start();
                    base.childInterface.publish("childInterfaceLoaded");
                    $(window).resize(base.setUIHeight);
                } else {
                    setTimeout(function () {
                        base.doLoad(childElement);
                    }, 100);
                }
            }
            else {
                setTimeout(function () {
                    base.doLoad(childElement);
                }, 100);
            }
        };

        base.setUIHeight = function () {
            $('#MP3_UI').height($(window).height() - 5);
        };

        base.triggerEvent = function (eventType, paramArray) {
            base.childInterface.triggerEvent(eventType, paramArray);
        };

        return base;
    }();

// ===================================================================
// Author: Matt Kruse <matt@mattkruse.com>
// WWW: http://www.mattkruse.com/
//
// NOTICE: You may use this code for any purpose, commercial or
// private, without any further permission from the author. You may
// remove this notice from your final code if you wish, however it is
// appreciated by the author if at least my web site address is kept.
//
// You may *NOT* re-distribute this code in any way except through its
// use. That means, you can include it in your product, or your web
// site, or any other form where the code is actually being used. You
// may not put the plain javascript up on your site for download or
// include it in your javascript libraries for download.
// If you wish to share this code with others, please just point them
// to the URL instead.
// Please DO NOT link directly to my .js files from your site. Copy
// the files to your server and use them there. Thank you.
// ===================================================================
var DumperIndent = 1;var DumperIndentText = " ";var DumperNewline = "\n";var DumperObject = null;var DumperMaxDepth = -1;var DumperIgnoreStandardObjects = true;var DumperProperties = null;var DumperTagProperties = new Object();
function DumperGetArgs(a,index){var args = new Array();for(var i=index;i<a.length;i++){args[args.length] = a[i];}return args;}
function DumperAlert(o){alert(Dumper(o,DumperGetArgs(arguments,1)));}
function DumperWrite(o){var argumentsIndex = 1;var d = document;if(arguments.length>1 && arguments[1]==window.document){d = arguments[1];argumentsIndex = 2;}var temp = DumperIndentText;var args = DumperGetArgs(arguments,argumentsIndex);
DumperIndentText = "&nbsp;";d.write(Dumper(o,args));DumperIndentText = temp;}
function DumperPad(len){var ret = "";for(var i=0;i<len;i++){ret += DumperIndentText;}return ret;}
function Dumper(o){var level = 1;var indentLevel = DumperIndent;var ret = "";if(arguments.length>1 && typeof(arguments[1])=="number"){level = arguments[1];indentLevel = arguments[2];if(o == DumperObject){return "[original object]";}}else{DumperObject = o;if(arguments.length>1){var list = arguments;var listIndex = 1;if(typeof(arguments[1])=="object"){list = arguments[1];listIndex = 0;}for(var i=listIndex;i<list.length;i++){if(DumperProperties == null){DumperProperties = new Object();}DumperProperties[list[i]]=1;}}}if(DumperMaxDepth != -1 && level > DumperMaxDepth){return "...";}if(DumperIgnoreStandardObjects){if(o==window || o==window.document){return "[Ignored Object]";}}if(o==null){ret = "[null]";return ret;}if(typeof(o)=="function"){ret = "[function]";return ret;}if(typeof(o)=="boolean"){ret =(o)?"true":"false";return ret;}if(typeof(o)=="string"){ret = "'" + o + "'";return ret;}if(typeof(o)=="number"){ret = o;return ret;}if(typeof(o)=="object"){if(typeof(o.length)=="number"){ret = "[";for(var i=0;i<o.length;i++){if(i>0){ret += "," + DumperNewline + DumperPad(indentLevel);}else{ret += DumperNewline + DumperPad(indentLevel);}ret += Dumper(o[i],level+1,indentLevel-0+DumperIndent);}if(i > 0){ret += DumperNewline + DumperPad(indentLevel-DumperIndent);}ret += "]";return ret;}else{ret = "{";var count = 0;for(i in o){if(o==DumperObject && DumperProperties!=null && DumperProperties[i]!=1){}else{if(typeof(o[i]) != "unknown"){var processAttribute = true;if(typeof(o.tagName)!="undefined"){if(typeof(DumperTagProperties[o.tagName])!="undefined"){processAttribute = false;for(var p=0;p<DumperTagProperties[o.tagName].length;p++){if(DumperTagProperties[o.tagName][p]==i){processAttribute = true;break;}}}}if(processAttribute){if(count++>0){ret += "," + DumperNewline + DumperPad(indentLevel);}else{ret += DumperNewline + DumperPad(indentLevel);}ret += "'" + i + "' => " + Dumper(o[i],level+1,indentLevel-0+i.length+6+DumperIndent);}}}}if(count > 0){ret += DumperNewline + DumperPad(indentLevel-DumperIndent);}ret += "}";return ret;}}}
// END include

window.logger = {
    dumperAlertExist: null,
    dumperExist: null,
    writeToFileLog: false,
    checkedForLogFile: false,
    memoryProfilingEnabled: false,
    lastMemoryValue: 0,
    log: function (message) {
        if(!message) message = "";
        if(this.memoryProfilingEnabled) {
            var currentValue = (air.System.privateMemory / 1024);
            message = "memory (diff: " + (currentValue - this.lastMemoryValue) + ("KB,\ttotal: " + currentValue) + "KB) " + message;
            this.lastMemoryValue = currentValue;
        }
        var timestamp = "";
        try {
            var currentTime = new Date();
            var month = currentTime.getMonth() + 1;
            var day = currentTime.getDate();
            var year = currentTime.getFullYear();
            var hours = currentTime.getHours();
            var minutes = currentTime.getMinutes();
            var seconds = currentTime.getSeconds();
            var milliseconds = currentTime.getMilliseconds();

            timestamp = "[" + month + "/" + day + "/" + year + " " + hours + ":" + minutes + ":" + seconds + "." + milliseconds + "]";
            air.trace(timestamp + " " + message);
        } catch (e) {
            try {
                console.log(message);
            } catch (e2) {}
        }

        /* disable the following functions search key: DB_LOGS
        if (!this.checkedForLogFile) {
            this.checkedForLogFile = true;
            this.shouldWriteToFileLog = window.logger.logFileExists();
        }
        */

        //if (this.shouldWriteToFileLog) {
            window.logger.writeToLogFile(timestamp + " " + message);
        //}

        /* disable the following functions search key: DB_LOGS
        if (amznMusic.air.database && amznMusic.air.creds && amznMusic.air.creds.customerId) {
            amznMusic.air.database.log(amznMusic.air.creds.customerId, message, timestamp);
        }
        */
    },
    dataError: function (request, response) {
        if ( window.logger.dumperAlertExist === false) {
            return;
        }
        else if (window.logger.dumperAlertExist === null) {
            window.logger.dumperAlertExist = (typeof(DumperAlert) == "function");
            window.logger.dataError(request, response);
        }
        else {
            var error = [
                { 'type': 'request',
                  'object' : request},
                { 'type' : 'response',
                  'object' : response}];
            DumperAlert(error);
        }
    },
    dataDebug: function dataDebug(output, groupName, info) {
        if ( window.logger.dumperExist === false) {
            return;
        }
        else if (window.logger.dumperExist === null) {
            window.logger.dumperExist = (typeof(Dumper) == "function");
            window.logger.dataDebug(output, groupName, info);
        }
        else {
            window.logger.log(Dumper(output), ( info ? groupName + ' (latency: ' + info.time + ' ms, size: ' + info.size + ' bytes)': groupName));
        }
    },
    logFileExists: function () {
        try {
            var file = air.File.userDirectory;
            file = file.resolvePath(".amu/logs/amuLog.txt");
            return file.exists;
        } catch (e) {
            air.trace("error checking log file exists " + e.message);
        }
    },
    /* disable the following functions search key: DB_LOGS
    dumpToLogFile: function (message) {

        message = message.substr(0, 2000);
        try {
            if (!this.fileStreamDump) {
                try {
                    this.logFile = air.File.userDirectory;
                    this.logFile = this.logFile.resolvePath("amuLogDump.txt");
                    this.fileStreamDump = new air.FileStream();
                    if (this.shouldTruncate) {
                        this.fileStreamDump.open(this.logFile, air.FileMode.WRITE);
                        this.fileStreamDump.position = 0;
                        this.fileStreamDump.truncate();
                    } else {
                        this.fileStreamDump.open(this.logFile, air.FileMode.APPEND);
                    }

                    var newSessionMarker = "\n\n@~@";
                    var msg = "new session started at: "+new Date()+"\n";
                    msg += "Operating System = " + air.Capabilities.os+"\n";
                    msg += "AIR Version = " + air.NativeApplication.nativeApplication.runtimeVersion+"\n";

                    this.fileStreamDump.writeUTFBytes(newSessionMarker+Array(msg.length).join("-")+"\n");
                    this.fileStreamDump.writeUTFBytes(msg);
                    this.fileStreamDump.close();
                } catch (e1) {
                    message = "cant write to log " + e1.message + "\n"+message;
                }
            }
            this.fileStreamDump.open(this.logFile, air.FileMode.APPEND);
            this.fileStreamDump.writeUTFBytes(message);
            this.fileStreamDump.writeUTFBytes(air.File.lineEnding);
            this.fileStreamDump.close();
        } catch (e) {
            air.trace("cant write log " + e.message);
        }
	},
	*/
    writeToLogFile: function (message) {
        if(!message) return;
        message = message.substr(0, 2000);
        try {
            if (!this.fileStream) {
                try {
                    this.logFile = air.File.documentsDirectory;
                    this.logFile = this.logFile.resolvePath("Amazon MP3 Uploader/logs/amuLog.txt");
                    this.fileStream = new air.FileStream();
                    if (this.logFile.exists && this.logFile.size > 10485760) { //10MB
                        var backupFile = air.File.documentsDirectory;
                        backupFile = backupFile.resolvePath("Amazon MP3 Uploader/logs/amuLog2.txt");
                        this.logFile.moveTo(backupFile, true);

                        this.logFile = air.File.documentsDirectory;
                        this.logFile = this.logFile.resolvePath("Amazon MP3 Uploader/logs/amuLog.txt");
                    }

                    this.fileStream.open(this.logFile, air.FileMode.APPEND);

                    var newSessionMarker = "\n\n@~@";
                    var msg = "new session started at: "+new Date()+"\n";
                    msg += "Operating System = " + air.Capabilities.os+"\n";
                    msg += "AIR Version = " + air.NativeApplication.nativeApplication.runtimeVersion+"\n";

                    this.fileStream.writeUTFBytes(newSessionMarker+Array(msg.length).join("-")+"\n");
                    this.fileStream.writeUTFBytes(msg);
                    this.fileStream.close();
                } catch (e1) {
                    message = "cant write to log " + e1.message + "\n"+message;
                }
            }
            this.fileStream.open(this.logFile, air.FileMode.APPEND);
            this.fileStream.writeUTFBytes(message);
            this.fileStream.writeUTFBytes(air.File.lineEnding);
            this.fileStream.close();
        } catch (e) {
            air.trace("cant write log " + e.message);
        }
    }
};

})(jQuery);
