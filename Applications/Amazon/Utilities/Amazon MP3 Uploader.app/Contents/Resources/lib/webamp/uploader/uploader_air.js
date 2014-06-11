/* Copyright 2011 Amazon Technologies, Inc. All Rights Reserved.
*
* This file is derived from YUI Uploader, Copyright (c) 2011, Yahoo! Inc. All rights reserved.
* Redistribution and use of this software in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
* á Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
* á Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
* á Neither the name of Yahoo! Inc. nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission of Yahoo! Inc.
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
(function($, amznMusic, undefined){

    amznMusic.uploader = amznMusic.uploader || {};
    amznMusic.uploader.bridge = amznMusic.uploader.bridge || {};
    
    var childInterface;
    var currentSong = null;
    var isUploading = false;
    var file;
    var completeCallback = null;//notify caller of upload success/failure.

    amznMusic.uploader.bridge.Air = Class.extend({
    
        init: function(args){
            childInterface = args;
            createUploadFile();
        },
        
        upload: function(song, response, triggerSecurityError, callback){

            completeCallback = callback;

            var result = response.getUploadUrlResponse.getUploadUrlResult.uploadRequest;
            var url = result.endpoint;

            if(triggerSecurityError === true){
                var msg = "Problem uploading file: " + song.path + " to endpoint: " + url;
                var err = new air.SecurityErrorEvent('flash.events.SecurityErrorEvent', /*bubbles*/ false, /*cancelable*/ false, msg);
                securityErrorHandler(err);
                return;
            }

            var method = result.httpVerb;
            var vars = result.parameters;
            var request = formURLRequest(url, method, vars);
            $.proxy(uploadSong, this)(request, song);
        },

        testNetworkAvailability: function(callback){
            var urlStream = new air.URLStream();
            var urlRequest = new air.URLRequest('http://www.amazon.com');
            urlRequest.method = "GET";
            urlStream.addEventListener(air.HTTPStatusEvent.HTTP_RESPONSE_STATUS, function (event){
                urlStream.removeEventListener(air.HTTPStatusEvent.HTTP_RESPONSE_STATUS, arguments.callee);
                urlStream.removeEventListener(air.SecurityErrorEvent.SECURITY_ERROR, arguments.callee);
                urlStream.removeEventListener(air.IOErrorEvent.IO_ERROR, arguments.callee);

                var avail = (Number(event.status) < 400);//200-300 http status is success
                urlStream.close();
                callback(avail);
            });

            urlStream.addEventListener(air.SecurityErrorEvent.SECURITY_ERROR, function(event){
                urlStream.removeEventListener(air.HTTPStatusEvent.HTTP_RESPONSE_STATUS, arguments.callee);
                urlStream.removeEventListener(air.SecurityErrorEvent.SECURITY_ERROR, arguments.callee);
                urlStream.removeEventListener(air.IOErrorEvent.IO_ERROR, arguments.callee);

                urlStream.close();
                callback(false);
            });

            urlStream.addEventListener(air.IOErrorEvent.IO_ERROR, function(event){
                urlStream.removeEventListener(air.HTTPStatusEvent.HTTP_RESPONSE_STATUS, arguments.callee);
                urlStream.removeEventListener(air.SecurityErrorEvent.SECURITY_ERROR, arguments.callee);
                urlStream.removeEventListener(air.IOErrorEvent.IO_ERROR, arguments.callee);

                urlStream.close();
                callback(false);
            });

            urlStream.load(urlRequest);
        },
        cancelUpload: false

    });

    var stopTestUpload = function(){
        window.logger.log("uploader_air.js stopTestUpload()");
        file.removeEventListener(air.Event.CANCEL, cancelHandler);
        file.cancel();
        file.addEventListener(air.Event.CANCEL, cancelHandler);
        if('function' === typeof completeCallback){
            completeCallback(true);
            completeCallback = null;
        }else{
            file.dispatchEvent(new air.DataEvent(air.DataEvent.UPLOAD_COMPLETE_DATA));
        }
    };
    var formURLRequest = function(url, method, vars){
        method = method ? method : "GET";
        
        var request = new air.URLRequest();
        request.url = url;
        request.method = method;
        request.data = new air.URLVariables();
        
        for (var itemName in vars) {
            request.data[itemName] = vars[itemName];
        }
        
        return request;
    };
    
    function createUploadFile(){
        file = new air.File();
        file.addEventListener(air.Event.OPEN, openHandler);
        file.addEventListener(air.ProgressEvent.PROGRESS, progressHandler);
        file.addEventListener(air.Event.COMPLETE, completeHandler);
        file.addEventListener(air.DataEvent.UPLOAD_COMPLETE_DATA, uploadCompleteDataHandler);
        file.addEventListener(air.HTTPStatusEvent.HTTP_STATUS, httpStatusHandler);
        file.addEventListener(air.IOErrorEvent.IO_ERROR, ioErrorHandler);
        file.addEventListener(air.SecurityErrorEvent.SECURITY_ERROR, securityErrorHandler);
        file.addEventListener(air.Event.CANCEL, cancelHandler);
    }
    
    function openHandler(e){
        childInterface.publish(childInterface.consts.Event.OPEN, currentSong, e);
    }
    
    function progressHandler(e){
        if (uploader.airWrapper.cancelUpload) {
            amznMusic.uploader.bridge.Air.cancelUpload = false;

            if (currentSong.isTest) {
                stopTestUpload();
            } else {
                file.cancel();
                childInterface.publish(childInterface.consts.Event.CANCEL, currentSong, e);
                currentSong = null;
                isUploading = false;
            }
        } else {
            childInterface.publish(childInterface.consts.Event.PROGRESS, currentSong, e);
        }
    }
    
    function completeHandler(e){
        childInterface.publish(childInterface.consts.Event.COMPLETE, currentSong, e);

        air.System.gc();
        air.System.gc();
        try {
            new air.LocalConnection().connect('gc');
            new air.LocalConnection().connect('gc');
        } catch (e) {}
    }
    
    function uploadCompleteDataHandler(e){
        if('function' === typeof completeCallback){
            completeCallback(true);
            completeCallback = null;
        }else{
            childInterface.publish(childInterface.consts.Event.UPLOAD_COMPLETE_DATA, currentSong, e);
        }
        isUploading = false;
        currentSong = null;
    }
    
    function httpStatusHandler(e){
        if('function' === typeof completeCallback){
            var success = (Number(e.status) < 400); //200-300 http status is success
            completeCallback(success);
            completeCallback = null;
        }else{
            childInterface.publish(childInterface.consts.Event.HTTP_STATUS, currentSong, e);
        }
    }
    
    function ioErrorHandler(e){
        if('function' === typeof completeCallback){
            completeCallback(false);
            completeCallback = null;
        }else{
        childInterface.publish(childInterface.consts.Event.IO_ERROR, currentSong, e);
        }
        isUploading = false;
        currentSong = null;
    }
    
    function securityErrorHandler(e){
        if('function' === typeof completeCallback){
            completeCallback(false);
            completeCallback = null;
        }else{
        childInterface.publish(childInterface.consts.Event.SECURITY_ERROR, currentSong, e);
        }
        isUploading = false;
        currentSong = null;
    }
    
    function cancelHandler(e){
        if('function' === typeof completeCallback){
            completeCallback(true);
            completeCallback = null;
        }else{
        childInterface.publish(childInterface.consts.Event.CANCEL, currentSong, e);
        }
        isUploading = false;
        currentSong = null;
    }
    
    function uploadSong(request, song){
        if (isUploading && !currentSong.isTest) {
            window.logger.log("already uploading " +currentSong.path+ " skipping " + song.path);
            return false;
        } else if (isUploading && currentSong.isTest) {
            stopTestUpload();
        }
        isUploading = true;
        currentSong = song;
        uploader.airWrapper.cancelUpload = false;
        if (song.isTest) {
            file.url = song.path;
        } else {
            file.nativePath = song.path;
        }

        try {
            file.upload(request, "file");
        } catch (e) {
            if('function' === typeof completeCallback){
                completeCallback(false);
                completeCallback = null;
            }
            window.logger.log("Error uploading (uploader_air.js): " + e);
        }
        return true;
    }
    
})(jQuery, window.amznMusic = window.amznMusic || {});
