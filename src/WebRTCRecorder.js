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
const {
	codecs
} = RTCRtpSender.getCapabilities('video');
console.log(codecs)
let codecs_videos = RTCRtpReceiver.getCapabilities('video').codecs.filter(
function(codec) {return codec.mimeType.toLowerCase() === 'video/h264'});
console.log(codecs_videos)

import {
	LocalRecorder
} from './localRecorder.js'

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

	constructor(options) {
		this.api = options.api || '';
		this.pc = null;
		this.channel = null;
		this.sender = null;
		this.logger = options.logger === true ? new Logger(true) : new Logger(false);
		this.mergerStream = null;
		this.recordMic = options.recordMic || false;
		this.bandwidthInKbps = options.bandwidthInKbps || 2000 //  kbps

		this.lastReceived = null;
		this.lastTimestampFR = null;
		this.lastSend = null;
		this.lastTimestampFS = null;
		this.timer = null;
		this.localRecorder = null;

		this.config = options.config || {
			sdpSemantics: 'unified-plan',
			iceServers: [{
				urls: 'stun:stun.l.google.com:19302'
			}]
		};
		this.remoteCallBackInfo = null

		this.mergerParams = options.mergerParams || {
			width: 1280,
			height: 720,
			fps: 30
		};


	}

	async getLocalUserMedia() {
		return (await navigator.mediaDevices.getUserMedia({
			audio: true,
			video: {
				width: {
					min: 1280
				},
				height: {
					min: 720
				}
			}
		}))
	}


	async getShareMedia(){
		const constraints = {
			video:{width:1920,height:1080},
			audio:true
		};
		if (window.stream) {
			window.stream.getTracks().forEach(track => {
				track.stop();
			});
		}
		return await navigator.mediaDevices.getDisplayMedia(constraints).catch(this.handleError);
	}

	/**
	 * @description merger videos and record to cloud
	 * @param {Object} videoElements
	 */
	async startStreamMerger(videoElements, type = "requestAnimation") {
		const that = this
		this.mergerStream = await this.composeVideos(videoElements, type)
		this.setVideoTrackContentHints(this.mergerStream, 'motion')
		this.mergerStream.getTracks().forEach(track => {
			that.logger.debug("sender track info",track.getSettings())
		})

		// this.mergerStream = await this.getLocalUserMedia()
		this.setDomVideoStream('mergerVideoELe', this.mergerStream)

	}
	/**
	 * @param {Object} stream
	 * @param {Object} hint motion :【应将轨道视为包含运动很重要的视频】保持流畅性 但是降低分辨率
	 * detail：【应将轨道视为视频细节格外重要】分辨率不变 但是fps可以变动； text：【应将轨道视为视频细节格外重要】分辨率不变 但是fps可以变动
	 */
	setVideoTrackContentHints(stream, hint) {
		const tracks = stream.getVideoTracks();
		tracks.forEach(track => {
			if ('contentHint' in track) {
				track.contentHint = hint;
				if (track.contentHint !== hint) {
					console.warn('Invalid video track contentHint: \'' + hint + '\'');
				}
			} else {
				console.warn('MediaStreamTrack contentHint attribute not support ');
			}
		});
	}

	/**
	 * @description 本地录制
	 * @param {Object} mediaStream
	 */
	async sendLocalRecord(mediaStream) {
		this.localRecorder = new LocalRecorder();
		await this.localRecorder.startRecording(mediaStream);
	}
	/**
	 * @description 停止本地录制
	 * @returns { blob, videoUrl, totalTime }
	 */
	async stopLocalRecord() {
		// const { blob, videoUrl, totalTime } = await recorder.stopRecording();
		return await this.localRecorder.stopRecording();
	}

	/**
	 * @description start remote recorder
	 * @param {Object} mediaStream 合成流
	 */
	async sendRemoteRecord(mediaStream) {
		if (mediaStream) {
			const cloneStream = mediaStream.clone()
			this.targetStreamToRemote(cloneStream.getVideoTracks()[0], cloneStream.getAudioTracks()[0])
		} else {
			console.error("请先合成视频画面再进行远程录制")
		}
	}

	/**
	 * @description get mic audio
	 */
	async getSpeakerAudioStream() {
		return (await navigator.mediaDevices.getUserMedia({
			audio: true
		}))
	}

	/**
	 * @description merger all audio stream
	 * @param {Object} speakerStream
	 * @param {Object} audioStream
	 */
	async mixAudioStreams(speakerStream, audioStream) {
		let audioContext = new AudioContext();
		let destinationNode = audioContext.createMediaStreamDestination();

		let speakerSourceNode = audioContext.createMediaStreamSource(speakerStream);
		let audioSourceNode = audioContext.createMediaStreamSource(audioStream);

		speakerSourceNode.connect(destinationNode);
		audioSourceNode.connect(destinationNode);

		let mixedAudioStream = new MediaStream(destinationNode.stream.getAudioTracks());
		return mixedAudioStream;
	}

	/**
	 * @description merger origin video dom audio
	 * @param {Object} videos
	 */
	async mergerAllVideoDomOriginAudioStream(videos) {
		// 创建用于混音的AudioContext和MediaStreamDestination节点
		var audioContext = new AudioContext();
		var destinationNode = audioContext.createMediaStreamDestination();

		// 创建用于混合视频的MediaStreamAudioSourceNode
		var videoSourceNodes = [];
		for (var i = 0; i < videos.length; i++) {
			var video = videos[i].dom;
			if (video.captureStream().getAudioTracks().length > 0 && !video.mute) {
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

	async composeVideos(videos, type = "requestAnimation") {
		var canvas = document.createElement("canvas");
		var ctx = canvas.getContext("2d");

		canvas.width = this.mergerParams.width;
		canvas.height = this.mergerParams.height;
		let frameInterval = (1000 / this.mergerParams.fps).toFixed(2)
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
			if (type === 'requestAnimation') {
				requestAnimationFrame(drawVideo);
			} else {
				setTimeout(drawVideo, frameInterval);
			}

		}

		// 开始绘制画面
		drawVideo();

		// 将音频流和视频流混合到一个MediaStream对象中
		let originAudioStream = await this.mergerAllVideoDomOriginAudioStream(videos)
		var stream = canvas.captureStream(this.mergerParams.fps);
		if (this.recordMic === true) {
			let speakerStream = await this.getSpeakerAudioStream()
			let mixAudioStream = await this.mixAudioStreams(speakerStream, originAudioStream)
			stream.addTrack(mixAudioStream.getAudioTracks()[0]);
		} else {
			stream.addTrack(originAudioStream.getAudioTracks()[0]);
		}

		return stream;
	}

	setDomVideoTrick(domId, trick) {
		let video = document.getElementById(domId)
		if (!video) {
			return
		}
		let stream = video.srcObject
		if (stream) {
			stream.addTrack(trick)
		} else {
			stream = new MediaStream()
			stream.addTrack(trick)
			video.srcObject = stream
			video.autoplay = true;
			video.muted = true
			video.setAttribute('playsinline', '')
		}
		video.setAttribute('playsinline', '')
	}

	setDomVideoStream(domId, newStream) {
		let video = document.getElementById(domId)
		if (!video) {
			return
		}
		let stream = video.srcObject
		if (stream) {
			stream.getTracks().forEach(function(track) {
				stream.removeTrack(track)
			});
		} else {
			video.srcObject = newStream
			video.autoplay = true;
			video.muted = true
			video.setAttribute('playsinline', '')
		}
		video.setAttribute('playsinline', '')
	}

	calculateReceiverBitrate(pc) {
		const that = this
		pc.getStats().then((res) => {
			res.forEach(report => {
				let bytes;
				let headerBytes;
				let packets;
				const now = report.timestamp;
				if (report.type === 'outbound-rtp' && report.kind === "video") {

					bytes = report.bytesSent;
					if (that.lastSend && that.lastSend.has(report.id)) {
						const bitrate = 8 * (bytes - that.lastSend.get(report.id)
								.bytesSent) /
							(now - that.lastSend.get(report.id).timestamp);

						console.log(`当前出口bitrate为：${bitrate.toFixed(3)} kbps`);
					}
					that.lastSend = res
				}
				if (report.type === 'inbound-rtp' && report.kind === "video") {

					bytes = report.bytesReceived;
					if (that.lastReceived && that.lastReceived.has(report.id)) {
						const bitrate = 8 * (bytes - that.lastReceived.get(report.id)
								.bytesReceived) /
							(now - that.lastReceived.get(report.id).timestamp);

						console.log(`当前入口bitrate为：${bitrate.toFixed(3)} kbps`);
					}
					that.lastReceived = res
				}

			});

		});
	}
	async statsBandwidth(pc) {
		const that = this
		if (!pc) {
			return
		}
		if (this.timer) {
			clearInterval(this.timer)
		}

		this.timer = setInterval(async () => {
			that.calculateReceiverBitrate(pc)
		}, 3000)

	}

	bandwidthConstraint(sdp, bandwidth) {
		let modifier = 'AS';
		// if (adapter.browserDetails.browser === 'firefox') {
		//   bandwidth = (bandwidth >>> 0) * 1000;
		//   modifier = 'TIAS';
		// }
		// 查找 c=IN 行的位置
		const cIndex = sdp.indexOf("c=IN ");
		// 添加新的 AS 宽带限制
		if (sdp.indexOf("b=AS:") === -1) {
		  sdp = sdp.slice(0, cIndex) + 'b=AS:'+bandwidth+'\r\n'+ sdp.slice(cIndex);
		} else {
		  sdp = sdp.replace(/b=AS:\d+/, 'b=AS:'+bandwidth+'\r\n');
		}

		return sdp;
	}

	/**
	 * @description 传输过程中变更
	 * @param {Object} biterate
	 */
	async changeBitRate(biterate) {
		if (this.pc) {
			const senders = this.pc.getSenders();
			const send = senders.find((s) => s.track.kind === 'video')
			const parameters = send.getParameters();
			parameters.encodings[0].maxBitrate = biterate * 1000; //kbps
			await send.setParameters(parameters);
			console.log(send.getParameters())
		}

	}

	async targetStreamToRemote(vTrack, aTrack) {
		this.pc = await new PeerConnection(this.config);
		this.pc.addTransceiver('audio', {
			direction: 'sendrecv'
		});
		let transceiver = this.pc.addTransceiver('video', {
			direction: 'sendrecv',
		});
		// 约束为H264编码
		// transceiver.setCodecPreferences(codecs_videos);

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
			type: offer.type,
			sdp: this.bandwidthConstraint(offer.sdp, this.bandwidthInKbps)
		}
		this.logger.debug(resOffer.sdp);
		await this.pc.setLocalDescription(resOffer);
		this.sender = this.pc.addTrack(vTrack);

		const parameters = this.sender.getParameters();
		this.logger.info('sender parameters', parameters);
		if(aTrack){
			this.pc.addTrack(aTrack);
		}
		this.pc.addEventListener('icecandidate', event => {
			if (event.candidate) {
				this.logger.info("ICE Candidate ==========>", event.candidate)
			} else {
				/* 在此次协商中，没有更多的候选了 */
				this.logger.info('在此次协商中，没有更多的候选了');
			}
		});
		this.pc.addEventListener('iceconnectionstatechange', async event => {
			this.logger.info('pc.iceConnectionState', this.pc.iceConnectionState);
		});

		this.pc.addEventListener('signalingstatechange', async () => {
		  if (this.pc.signalingState === 'stable') {
			  await this.statsBandwidth(this.pc)
		    const sender = this.pc.getSenders().find(
		      sender => sender.track.kind === 'video'
		    );
		    if (sender) {
		      const parameters = sender.getParameters();
			  parameters.encodings[0].maxBitrate = this.bandwidthInKbps * 1000;
			  parameters.encodings[0].scaleResolutionDownBy = 1;
		      await sender.setParameters(parameters);
			  console.log("-------set bitrate------------", sender.getParameters())
		    }
		  }
		});

		this.pc.addEventListener('icegatheringstatechange', async ev => {
			let connection = ev.target;
			this.logger.info("ICE Candidate state ==========>  ", connection.iceGatheringState);
			switch (connection.iceGatheringState) {
				case 'gathering':
					/* 候选人收集已经开始 */
					break;
				case 'complete':
					/* 候选人收集完成 */
					var offer = this.pc.localDescription;
					let sdp = offer.sdp;
					let result = await this.pullRemoteAnswerSdp(sdp, 6000);
					const remoteDesc = {
						type: 'answer',
						sdp: this.bandwidthConstraint(result['sdp'], this.bandwidthInKbps)
					};
					this.logger.info('remoteDesc', remoteDesc.sdp);
					await this.pc.setRemoteDescription(new RTCSessionDescription(remoteDesc));
					break;
			}
		});

		this.pc.addEventListener('track', evt => {
			setInterval(() => {
				this.logger.debug('远程媒体', evt.track.getSettings());
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
			this.remoteCallBackInfo = res
			if (res.code !== 200) {
				throw new Error("交换SDP信令失败+" + res);
			}
			return res.data;
		} catch (err) {
			clearTimeout(timeoutId);
			this.logger.error(err);
			throw err;
		}
	}
	/**
	 * @description 结束远程录制
	 */
	async stopRemoteRecord() {
		if (this.pc) {
			this.pc.close()
		}
	}

}
