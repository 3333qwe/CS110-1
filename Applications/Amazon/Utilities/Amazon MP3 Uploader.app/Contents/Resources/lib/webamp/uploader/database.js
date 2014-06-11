(function($, amznMusic, undefined) {

	amznMusic.air = amznMusic.air || {};
    
    amznMusic.air.Database = Class.extend(function () {
        var base = {};

        // database globals
        var dbFileName;
        var dbFile;
        var conn = null;
        var openCallback = null;
        var _logTableInitialized = false;

		base.init = function(args) {
            air.NativeApplication.nativeApplication.addEventListener(runtime.flash.events.KeyboardEvent.KEY_DOWN, app_keyDown)
		};
        var app_keyDown = function(event){
            //window.logger.log("database.js app_keyDown event.charCode = " +  event.charCode + " event.keyCode =" + event.keyCode);
            if(event.ctrlKey && event.shiftKey && event.altKey && event.charCode == 68){ // the d key
                try {
                    if(conn){
                        conn.addEventListener(air.SQLEvent.CLOSE, conn_close);
                        conn.close();
                        window.logger.log("database.js closing db connection");
                    } 
                } catch (e) {
                    window.logger.log("database.js app_keyDown error handling keydown " + e.toString());
                }
            }
            /* disable the following functions search key: DB_LOGS
            else
            if(event.ctrlKey && event.shiftKey && event.altKey && event.charCode == 76){ // the l key
                try {
                    window.logger.log("************************************************");
                    window.logger.log("Log Dump Marker");
                    window.logger.log("************************************************");

                    base.getLastNLogs(amznMusic.air.creds.customerId, 100000, function (results) {
                        if (results && results[0]) {

                            var length = results.length;
                            for (var i = length-1; i >= 0; i--) {
                                var timestamp = results[i].dbTimestamp;
                                var message = results[i].message;

                                window.logger.dumpToLogFile("[" + timestamp + "] " + message);
                            }
                        }

                        window.logger.log("database.js wrote to log file");
                    });
                } catch (e) {
                    window.logger.log("database.js app_keyDown write to log file " + e.toString());
                }
            }
            else
            if(event.ctrlKey && event.shiftKey && event.altKey && event.charCode == 67){ // the c key
                try {
                    base.clearLogs(function () {
                        window.logger.log('Cleared Logs');
                    });
                } catch (e) {
                    window.logger.log("database.js app_keyDown clear log file " + e.toString());
                }
            }
            */
        };
        
        var conn_close = function(event) {
            window.logger.log("database.js db connection closed");
            try {
                if(conn){
                    conn.removeEventListener(air.SQLEvent.CLOSE, conn_close);
                    conn.removeEventListener(air.SQLEvent.OPEN, openHandler);
                    conn.removeEventListener(air.SQLErrorEvent.ERROR, openError);
                }
                window.logger.log("database.js deleting db file");
                if (dbFile && dbFile.exists) {
                    dbFile.deleteFile();
                    window.logger.log("database.js db file deleted");
                } else {
                    window.logger.log("database.js db file does not exist.")
                }
                window.logger.log("database.js reopening db connection");
                conn = null;
                base.openConnection();
            } catch (e) {
                window.logger.log("database.js conn_close error resetting databse " + e.toString());
            }
        };

        var cleanUpConnection = function(){
            if(conn){
                conn.removeEventListener(air.SQLEvent.CLOSE, conn_close);
                conn.removeEventListener(air.SQLEvent.OPEN, openHandler);
                conn.removeEventListener(air.SQLErrorEvent.ERROR, openError);
                conn.close();
            }
        };

        //With tweaks from http://help.adobe.com/en_US/AIR/1.5/devappshtml/WS6A88523A-68C0-469e-8271-620A29661799.html

        base.openConnection = function (callback) {
            openCallback = callback;

            cleanUpConnection();

            conn = new air.SQLConnection();

            var dbid = amznMusic.air.creds.dbid;
            dbFileName = "encryptedMusicDatabase" + dbid + ".db";
            dbFile = air.File.applicationStorageDirectory.resolvePath(dbFileName);

            var encryptionKey = new air.ByteArray();
            var key = amznMusic.air.creds.customerId;
            while (key.length < 16) {
                key += key;
            }
            key = key.slice(0, 16);

            encryptionKey.writeUTFBytes(key);

            conn.addEventListener(air.SQLEvent.OPEN, openHandler);
            conn.addEventListener(air.SQLErrorEvent.ERROR, openError);

            if (!dbFile.exists) {
                // Create an encrypted database in asynchronous mode
                conn.openAsync(dbFile, air.SQLMode.CREATE, null, false, 1024, encryptionKey);
            } else {
                // Open an encrypted database in asynchronous mode
                conn.openAsync(dbFile, air.SQLMode.UPDATE, null, false, 1024, encryptionKey);
            }
        };

        var openHandler = function (event) {
            conn.removeEventListener(air.SQLEvent.OPEN, openHandler);
            conn.removeEventListener(air.SQLErrorEvent.ERROR, openError);

            window.logger.log('database.js openHandler Database connection opened');

            if('function' === typeof openCallback){
                openCallback(true);
                openCallback = null;
            }
        };

        var openError = function (event) {
            cleanUpConnection();

            if (event.error.errorID == 3138) {
                window.logger.log("database.js openError Incorrect encryption key");
            } else {
                window.logger.log("database.js openError Error message:", event.error.message);
                window.logger.log("database.js openError Details:", event.error.details);
            }

            if('function' === typeof openCallback){
                openCallback(false);
                openCallback = null;
            }
        };

        var _cachedStatements = [];
        base.execute = function (sql, parameters, callback) {

            if(!conn || !conn.connected){
                if (amznMusic.killState) {
                    return;
                }

                base.openConnection(function(success){
                    base.execute(sql, parameters, callback);
                });
                return;
            }

            try {
                var statement = null;
                if (_cachedStatements[sql]) {
                    statement = _cachedStatements[sql];
                } else {
                    statement = new air.SQLStatement();
                    statement.text = sql;

                    _cachedStatements[sql] = statement;
                }

                for (var param in parameters) {
                    statement.parameters[':' + param] = parameters[param];
                }

                statement.sqlConnection = conn;

                executeIfSafe(statement, callback);
            } catch (e) {
                window.logger.log("An error occured executing a sql statment: " + e.toString());
                 if (callback) {
                    callback();
                }
            }
        };

        var executeIfSafe = function (statement, callback) {
            if (!statement.executing) {
                function callbackListener(event){
                    var results = statement.getResult().data;
                    statement.removeEventListener(air.SQLEvent.RESULT, callbackListener);
                    statement.removeEventListener(air.SQLErrorEvent.ERROR, error);

                    if (callback) {
                        callback(results);
                    }
                }

                function error(event){
                    window.logger.log("database.js statement_error " + event.error.message);
                    window.logger.log("database.js statement_error " + event.error.details);
                    statement.removeEventListener(air.SQLEvent.RESULT, callbackListener);
                    statement.removeEventListener(air.SQLErrorEvent.ERROR, error);

                    if (callback) {
                        callback();
                    }
                }

                statement.addEventListener(air.SQLEvent.RESULT, callbackListener);
                statement.addEventListener(air.SQLErrorEvent.ERROR, error);

                statement.execute();
            } else {
                setTimeout(function () {
                    executeIfSafe(statement, callback);
                }, 0);
            }
        };

        base.start = function () {
            if (amznMusic.air.creds && amznMusic.air.creds.customerId) {

                base.openConnection(function(success){
                    //base.initSongTable();
                    //base.initLogTable(); disable the following functions search key: DB_LOGS
                });
            } else {
                setTimeout(base.start, 100);
            }
        };

        base.createTable = function (type, callback) {
            var createTable = "CREATE TABLE IF NOT EXISTS amu_" + type + " " +
                            "(id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                            "customerId VARCHAR(100) UNIQUE, " +
                            "data BLOB)";
            base.execute(createTable, null, callback);
        };

        base.saveData = function (type, customerId, data, callback) {
            base.createTable(type, function () {
                var alreadyExists = "SELECT customerId FROM amu_" + type + " WHERE customerId = :customerId";

                base.execute(alreadyExists, { customerId: customerId }, function (results) {
                    var saveOrUpdate;
                    if (results && results[0] && results[0].customerId === customerId) {
                        saveOrUpdate = "UPDATE amu_" + type + " SET data = :data WHERE customerId = :customerId";
                    } else {
                        saveOrUpdate = "INSERT INTO amu_" + type + " " +
                                        "(customerId, data)" +
                                        "VALUES (:customerId, :data)";
                    }

                    base.execute(saveOrUpdate, { customerId: customerId, data: data }, callback);
                });
            });
        };

        base.getSavedData = function (type, customerId, callback) {
            var getDataSql = "SELECT data FROM amu_" + type + " WHERE customerId = :customerId";
            var alreadyExists = "SELECT customerId FROM amu_" + type + " WHERE customerId = :customerId";

            base.execute(alreadyExists, { customerId: customerId }, function (results) {
                if (results && results[0] && results[0].customerId === customerId) {
                    base.execute(getDataSql, { customerId: customerId }, callback);
                } else {
                    window.logger.log("database.js getSavedData No data for type: " + type);

                    if (callback) { callback(); }
                }
            });
        };

        /* disable the following functions search key: DB_LOGS
        base.initLogTable = function (callback) {
            window.logger.log("database.js initLogTable");

            var createTable = "CREATE TABLE IF NOT EXISTS amu_logs " +
                                "(id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                                "customerId VARCHAR(100), " +
                                "dbTimestamp TEXT, " +
                                "logTimestamp TEXT," +
                                "message TEXT)";



            base.execute(createTable, null, function () {
                //remove oldest record from the amu_logs after each insert into the amu_logs - limit is 1 million records
                var createTrigger = "CREATE TRIGGER IF NOT EXISTS log_limit AFTER INSERT ON amu_logs " +
                                    "BEGIN " +
                                        "DELETE FROM amu_logs " +
                                    "WHERE id <= (SELECT max(id) FROM amu_logs) - 1000000; " +
                                    "END;";

                base.execute(createTrigger, null, function () {
                    _logTableInitialized = true;

                    if (callback) {
                        callback();
                    }
                });
            });
        };

        base.log = function (customerId, message, timestamp, callback) {
            if (!_logTableInitialized) {
                return;
            }

            var createTrigger = "INSERT INTO amu_logs (" +
                                    "customerId, dbTimestamp, logTimestamp, message " +
                                ") VALUES (" +
                                    ":customerId, datetime('now'), :logTimestamp, :message)";

            base.execute(createTrigger, {customerId:customerId, logTimestamp:timestamp, message:message}, callback);
        };

        base.getLastNLogs = function (customerId, numberOfLogs, callback) {
            var getDataSql = "SELECT * FROM amu_logs WHERE customerId = :customerId ORDER BY id DESC LIMIT :numberOfLogs";

            base.execute(getDataSql, { customerId: customerId, numberOfLogs: numberOfLogs }, callback);
        };

        base.clearLogs = function (callback) {
            var dropLogs = "DROP TABLE IF EXISTS amu_logs";

            base.execute(dropLogs, null, function () {
                base.initLogTable(callback);
            });
        };
        */

        base.initSongTable = function (callback) {
            window.logger.log("database.js initSongTable");

            var deleteTable = "DROP TABLE IF EXISTS amu_songs";
            base.execute(deleteTable, null, function () {
                var createTable = "CREATE TABLE IF NOT EXISTS amu_songs " +
                                "(id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                                "customerId VARCHAR(100), " +
                                "fromCirrus INTEGER, " +
                                "songId TEXT, " +
                                "objectId TEXT, " +
                                "storageKey TEXT, " +
                                "path TEXT, " +
                                "fileName TEXT, " +
                                "kind TEXT, " +
                                "parent TEXT, " +
                                "size TEXT, " +
                                "title TEXT, " +
                                "albumArtist TEXT, " +
                                "artist TEXT, " +
                                "album TEXT, " +
                                "isDRM INTEGER, " +
                                "isPodcast INTEGER, " +
                                "diskNumber TEXT, " +
                                "discNumber TEXT, " +
                                "trackNumber TEXT, " +
                                "duration INTEGER, " +
                                "dateAdded TEXT, " +
                                "format TEXT, " +
                                "existsInCirrus INTEGER, " +
                                "state TEXT, " +
                                "isTest INTEGER, " +
                                "isCompilation INTEGER, " +

                                "albumId TEXT, " +
                                "folderId TEXT, " +
                                "playlistIds TEXT)";

                base.execute(createTable, null, callback);
            });
        };

        base.saveSong = function (customerId,
                                  songData,
                                  callback) {


            var alreadyExists = "DELETE FROM amu_songs WHERE customerId = :customerId AND songId = :songId";

            base.execute(alreadyExists, { customerId: customerId, songId: songData.songId }, function () {
                var insertSql = "INSERT INTO amu_songs  (" +
                                    "customerId, " +
                                    "fromCirrus, " +
                                    "songId, " +
                                    "objectId, " +
                                    "storageKey, " +
                                    "path, " +
                                    "fileName, " +
                                    "kind, " +
                                    "parent, " +
                                    "size, " +
                                    "title, " +
                                    "albumArtist, " +
                                    "artist, " +
                                    "album, " +
                                    "isDRM, " +
                                    "isPodcast, " +
                                    "diskNumber, " +
                                    "discNumber, " +
                                    "trackNumber, " +
                                    "duration, " +
                                    "dateAdded, " +
                                    "format, " +
                                    "existsInCirrus, " +
                                    "state, " +
                                    "isTest, " +
                                    "isCompilation, " +
                                    "albumId, " +
                                    "folderId, " +
                                    "playlistIds" +
                                ") VALUES (" +
                                    ":customerId, " +
                                    ":fromCirrus, " +
                                    ":songId, " +
                                    ":objectId, " +
                                    ":storageKey, " +
                                    ":path, " +
                                    ":fileName, " +
                                    ":kind, " +
                                    ":parent, " +
                                    ":size, " +
                                    ":title, " +
                                    ":albumArtist, " +
                                    ":artist, " +
                                    ":album, " +
                                    ":isDRM, " +
                                    ":isPodcast, " +
                                    ":diskNumber, " +
                                    ":discNumber, " +
                                    ":trackNumber, " +
                                    ":duration, " +
                                    ":dateAdded, " +
                                    ":format, " +
                                    ":existsInCirrus, " +
                                    ":state, " +
                                    ":isTest, " +
                                    ":isCompilation, " +
                                    ":albumId, " +
                                    ":folderId, " +
                                    ":playlistIds" +
                                ")";

                base.execute(insertSql, { customerId: customerId,
                                            fromCirrus: songData.fromCirrus ? 1 : 0,
                                            songId: songData.songId,
                                            objectId: songData.objectId,
                                            storageKey: songData.storageKey,
                                            path: songData.path,
                                            fileName: songData.fileName,
                                            kind: songData.kind,
                                            parent: songData.parent,
                                            size: songData.size,
                                            title: songData.title,
                                            albumArtist: songData.albumArtist,
                                            artist: songData.artist,
                                            album: songData.album,
                                            isDRM: songData.isDRM ? 1 : 0,
                                            isPodcast: songData.isPodcast ? 1 : 0,
                                            diskNumber: songData.diskNumber,
                                            discNumber: songData.discNumber,
                                            trackNumber: songData.trackNumber,
                                            duration: songData.duration,
                                            dateAdded: songData.dateAdded,
                                            format: songData.format,
                                            existsInCirrus: songData.existsInCirrus ? 1 : 0,
                                            state: songData.state,
                                            isTest: songData.isTest ? 1 : 0,
                                            isCompilation: songData.isCompilation ? 1 : 0,
                                            albumId: songData.albumId,
                                            folderId: songData.folderId,
                                            playlistIds: songData.playlistIds
                                        }, callback);
            });
        };

        base.getSavedSong = function (customerId, songId, callback) {
            var getDataSql = "SELECT * FROM amu_songs WHERE customerId = :customerId AND songId = :songId";

            base.execute(getDataSql, {customerId: customerId, songId: songId}, callback);
        };

        return base;
    }());


})(jQuery, amznMusic);