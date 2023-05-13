navigator.getUserMedia = navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia;
const PeerConnection = window.RTCPeerConnection ||
    window.mozRTCPeerConnection ||
    window.webkitRTCPeerConnection;


/**
 * @author wangsr281436@gmail.com | 公众号：技术源share
 * @description cloud record videos
 */
const supportsSetCodecPreferences = window.RTCRtpTransceiver &&
  'setCodecPreferences' in window.RTCRtpTransceiver.prototype;
  console.log(supportsSetCodecPreferences)
  const {codecs} = RTCRtpSender.getCapabilities('video');
  console.log(codecs)
class Logger {
  constructor(log = true) {
    this.log = log;
  }

  enable() {
    this.log = true;
  }

  disable() {
    this.log = false;
  }

  debug(...args) {
    if (this.log) {
      console.debug(...args);
    }
  }

  info(...args) {
    if (this.log) {
      console.info(...args);
    }
  }

  warn(...args) {
    if (this.log) {
      console.warn(...args);
    }
  }

  error(...args) {
    console.error(...args);
  }
}
export class WebRTCRecorder {
	#lastBytesReceived = null;
	#lastTimestampFR = null;
	#lastBytesSend = null;
	#lastTimestampFS = null;
	#timer = null;
  constructor(options) {
    this.api = options.api || '';
	this.pc = null;
	this.channel = null;
	this.sender = null;
	this.logger = options.logger === true ? new Logger(true) : new Logger(false);
	this.mergerStream = null;
	this.recordMic = options.recordMic || false;
	this.bandwidth = 1*1000*1000 // 单位 bitrate（bit）   //配置说明： 1MB-> 1024*1024*8 bit 约等于 1000*1000*8 (如果1Mb则不乘8) 

	this.config = options.config || {
	  sdpSemantics: 'unified-plan',
	  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] 
	};

	this.mergerParams = options.mergerParams || {
		  width: 1280,
		  height: 720,
		  fps: 30
	};
	
	if(this.#timer){
		clearInterval(this.#timer)
	}
  }
  
  async getLocalUserMedia(){
	  return (await navigator.mediaDevices.getUserMedia({ audio: true,video:true }))
  }
	
 
  
   /**
   * @description merger videos and record to cloud
   * @param {Object} videoElements
   */
   async startStreamMerger(videoElements,type = "requestAnimation"){
        const that = this
        this.mergerStream = await this.composeVideos(videoElements,type)
		this.setDomVideoStream('mergerVideoELe',this.mergerStream)
         
    }
	/**
	 * @description start remote recorder
	 */
	async sendRemoteRecord(){
		if(this.mergerStream){
			const cloneStream = this.mergerStream.clone()
			this.targetStreamToRemote(cloneStream.getVideoTracks()[0],cloneStream.getAudioTracks()[0])
		}else{
			console.error("请先合成视频画面再进行远程录制")
		}
	}
	
	/**
	 * @description get mic audio
	 */
	async getSpeakerAudioStream() {
	  return (await navigator.mediaDevices.getUserMedia({ audio: true }))
	}
	
	/**
	 * @description merger all audio stream
	 * @param {Object} speakerStream
	 * @param {Object} audioStream
	 */
	async  mixAudioStreams(speakerStream, audioStream) {
	  var audioContext = new AudioContext();
	  var destinationNode = audioContext.createMediaStreamDestination();
	  
	  var speakerSourceNode = audioContext.createMediaStreamSource(speakerStream);
	  var audioSourceNode = audioContext.createMediaStreamSource(audioStream);
	  
	  speakerSourceNode.connect(destinationNode);
	  audioSourceNode.connect(destinationNode);
	  
	  var mixedAudioStream = new MediaStream(destinationNode.stream.getAudioTracks());
	  return mixedAudioStream;
	}
	
	/**
	 * @description merger origin video dom audio
	 * @param {Object} videos
	 */
	async mergerAllVideoDomOriginAudioStream(videos){
		// 创建用于混音的AudioContext和MediaStreamDestination节点
		 var audioContext = new AudioContext();
		 var destinationNode = audioContext.createMediaStreamDestination();
			
		 // 创建用于混合视频的MediaStreamAudioSourceNode
		 var videoSourceNodes = [];
		 for (var i = 0; i < videos.length; i++) {
		   var video = videos[i].dom;
			if(video.captureStream().getAudioTracks().length > 0){
				var sourceNode = null;
				sourceNode = audioContext.createMediaStreamSource(video.captureStream());
				videoSourceNodes.push(sourceNode);
			}
		 }
			
		 // 将所有视频元素的音频轨道连接到MediaStreamDestination节点
		 videoSourceNodes.forEach(function(sourceNode) {
		   sourceNode.connect(destinationNode);
		 });
		 return new MediaStream(destinationNode.stream.getAudioTracks());
	}
	
	async composeVideos(videos,type = "requestAnimation") {
	  var canvas = document.createElement("canvas");
	  var ctx = canvas.getContext("2d");
	
	  canvas.width = this.mergerParams.width;
	  canvas.height = this.mergerParams.height;
	
	  // 每帧绘制画面
	  function drawVideo() {
	    ctx.clearRect(0, 0, canvas.width, canvas.height);
	    for (var i = 0; i < videos.length; i++) {
	      var video = videos[i].dom;
	      var x = videos[i].x;
	      var y = videos[i].y;
	      var width = videos[i].width;
	      var height = videos[i].height;
	      var mute = videos[i].mute;	
	      // 绘制视频
	      ctx.drawImage(video, x, y, width, height);
	    }
		if(type === 'requestAnimation'){
			requestAnimationFrame(drawVideo);
		}else{
			setTimeout(drawVideo, frameInterval);
		}
	    
	  }
	
	  // 开始绘制画面
	  drawVideo();
	
	  // 将音频流和视频流混合到一个MediaStream对象中
	  let originAudioStream = await this.mergerAllVideoDomOriginAudioStream(videos)
	  var stream = canvas.captureStream(this.mergerParams.fps);
	  if(this.recordMic === true){
		  let speakerStream = await this.getSpeakerAudioStream()
		  let mixAudioStream = await this.mixAudioStreams(speakerStream,originAudioStream)
		  stream.addTrack(mixAudioStream.getAudioTracks()[0]);
	  }else{
		  stream.addTrack(originAudioStream.getAudioTracks()[0]);
	  }
	  
	  return stream;
	}

	setDomVideoTrick(domId,trick){
		let video = document.getElementById(domId)
		if(!video){
			return
		}
		let stream = video.srcObject
		if(stream){
			stream.addTrack(trick)
		}else {
			stream = new MediaStream()
			stream.addTrack(trick)
			video.srcObject = stream
			video.autoplay = true;
			video.muted = true
			video.setAttribute('playsinline','')
		}
		video.setAttribute('playsinline','')
	}
	
	setDomVideoStream(domId,newStream){
		let video = document.getElementById(domId)
		if(!video){
			return
		}
		let stream = video.srcObject
		if(stream){
			stream.getTracks().forEach(function (track) {
				stream.removeTrack(track)
			});
		}else {
			video.srcObject = newStream
			video.autoplay = true;
			video.muted = true
			video.setAttribute('playsinline','')
		}
		video.setAttribute('playsinline','')
	}
	
	 calculateReceiverBitrate(pc) {
		const that = this
	    pc.getStats().then((res) => {
	      res.forEach((report) => {
			
	        // 入口宽带
	        if (report.type === "inbound-rtp" && report.kind === "video" && report.bytesReceived) {
	          const bytesReceived = report.bytesReceived;
			  const now = report.timestamp;
	          if (that.#lastBytesReceived && that.#lastTimestampFR) {
	            let bf = bytesReceived - that.#lastBytesReceived;
	            let t = now - that.#lastTimestampFR;
	            const bitrate = (bf*8/1000/ t).toFixed(3);
	            console.log(`当前入口宽带为：${bitrate} kbps`);
	          }
	
	          // 更新上一次统计结果
	          that.#lastBytesReceived = bytesReceived;
	          that.#lastTimestampFR = now;
	        }
			// 出口宽带
			if (report.type === "outbound-rtp" && report.kind === "video" && report.bytesSent) {
			  const now = report.timestamp;
			  const bytesSent = report.bytesSent;
			  if (that.#lastBytesSend && that.#lastTimestampFS) {
			    let bf = bytesSent - that.#lastBytesSend;
			    let t = now - that.#lastTimestampFS;
				
			    // 计算宽带并输出到控制台上byte -> bf*8 bit  -> bf*8/1000 kbps 
			    const bitrate = (bf*8/1000/ t).toFixed(3);
			    console.log(`当前出口宽带为：  ${bf}-${bitrate} kbps`);
			  }
				
			  // 更新上一次统计结果
			  that.#lastBytesSend = bytesSent;
			  that.#lastTimestampFS = now;
			}
			
	      });
	    });
	  }
	statsBandwidth(pc){
		const that = this
		if(!pc){
			return
		}
		if(this.#timer){
			clearInterval(this.#timer)
		}
		
		this.#timer = setInterval(() => {
			that.calculateReceiverBitrate(pc)
		},3000)
		
	}
	
	bandwidthConstraint(sdp, bandwidth) {
	  const lines = sdp.split('\n');
	  let videoIndex = -1;
	  let hasBandwidth = false;
	
	  for (let i = 0; i < lines.length; i++) {
		if (lines[i].startsWith('m=video')) {
		  videoIndex = i;
		} else if (lines[i].startsWith('b=AS:')) {
		  lines[i] = 'b=AS:' + bandwidth;
		  hasBandwidth = true;
		}
	  }
	
	  if (!hasBandwidth && videoIndex >= 0) {
		lines.splice(videoIndex + 1, 0, 'b=AS:' + bandwidth);
	  }
	
	  return lines.join('\n');
	}
  
  async targetStreamToRemote(vTrack, aTrack) {
    this.pc = await new PeerConnection(this.config);
    this.pc.addTransceiver('audio', { direction: 'sendrecv' });
    this.pc.addTransceiver('video', { direction: 'sendrecv' });
	
    this.channel = await this.pc.createDataChannel('chat');
    this.channel.addEventListener('open', () => {
      this.logger.info('客户端通道创建');
    });
    this.channel.addEventListener('close', () => {
      this.logger.info('客户端通道关闭');
    });
    this.channel.addEventListener('message', evt => {
      this.logger.info('来自对端消息', evt.data);
    });

    let offer = await this.pc.createOffer(this.config);
	
   
	let resOffer = {
		type:offer.type,
		sdp:this.bandwidthConstraint(offer.sdp,this.bandwidth)
	}
	this.logger.info(resOffer.sdp);
    await this.pc.setLocalDescription(resOffer);
    this.sender = this.pc.addTrack(vTrack);
    const parameters = this.sender.getParameters();
    this.logger.info('sender parameters', parameters);
    this.pc.addTrack(aTrack);
    this.pc.addEventListener('icecandidate', event => {
      if (event.candidate) {
        this.logger.info("ICE Candidate ==========>",event.candidate)
      } else {
        /* 在此次协商中，没有更多的候选了 */
        this.logger.info('在此次协商中，没有更多的候选了');
      }
    });
    this.pc.addEventListener('iceconnectionstatechange',async event => {
      this.logger.info('pc.iceConnectionState', this.pc.iceConnectionState);
	  //scaleResolutionDownBy选项是指示浏览器是否自动降低视频分辨率的选项。
      if (this.pc.iceConnectionState === 'connected') {
		  // this.statsBandwidth(this.pc)
        const sender = this.pc.getSenders().find(s => s.track.kind === 'video');
		// const constraints = {
		//   width: {min: 640},
		//   height: {min: 480},
		//   frameRate: {min: 20,max:30}
		// };
        const parameters = sender.getParameters();
        delete parameters.encodings[0].scaleResolutionDownBy;
		parameters.encodings[0].minBitrate = this.bandwidth;
        sender.setParameters(parameters);
		// await sender.track.applyConstraints(constraints)
      }
    });

    this.pc.addEventListener('icegatheringstatechange', async ev => {
      let connection = ev.target;
      this.logger.info("ICE Candidate state ==========>  ",connection.iceGatheringState);
      switch (connection.iceGatheringState) {
        case 'gathering':
          /* 候选人收集已经开始 */
          break;
        case 'complete':
          /* 候选人收集完成 */
          var offer = this.pc.localDescription;
          let sdp = offer.sdp;
          let result = await this.pullRemoteAnswerSdp(sdp,6000);
          const remoteDesc = { type: 'answer', sdp: this.bandwidthConstraint(result['sdp'],this.bandwidth) };
          this.logger.info('remoteDesc', remoteDesc);
          await this.pc.setRemoteDescription(new RTCSessionDescription(remoteDesc));
          break;
      }
    });

    this.pc.addEventListener('track', evt => {
      setInterval(() => {
        this.logger.info('远程媒体', evt.track.getSettings());
      }, 10000);

      this.setDomVideoTrick('remoteRecordVideo', evt.track);
    });

    this.pc.addEventListener('datachannel', ev => {
      ev.channel.addEventListener('open', () => {
        this.logger.info('服务端消息通道打开');
      });
      ev.channel.addEventListener('message', data => {
        this.logger.info('服务端消息', data.data);
      });
      ev.channel.addEventListener('close', () => {
        this.logger.info('服务端消息通道关闭');
      });
    });
  }

	
  async pullRemoteAnswerSdp(sdp, timeout) {
    const controller = new AbortController();
    const signal = controller.signal;
  
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);
  
    try {
      const response = await fetch(`${this.api}/recorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          "sdp": sdp,
          "type": "",
          "fileName": ""
        }),
        signal // 将 signal 对象传递给 fetch 函数的配置对象
      });
      clearTimeout(timeoutId);
      const res = await response.json();
      if (res.code !== 200) {
        throw new Error("交换SDP信令失败+"+res);
      }
      return res.data;
    } catch (err) {
      clearTimeout(timeoutId);
      this.logger.error(err);
      throw err;
    }
  }

}





