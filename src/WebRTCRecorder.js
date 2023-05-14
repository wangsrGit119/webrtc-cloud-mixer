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

import {LocalRecorder} from './localRecorder.js'

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
	#localRecorder = null;
	constructor(options) {
		this.api = options.api || '';
		this.pc = null;
		this.channel = null;
		this.sender = null;
		this.logger = options.logger === true ? new Logger(true) : new Logger(false);
		this.mergerStream = null;
		this.recordMic = options.recordMic || false;
		this.bandwidth = 8 * 1000 *
			1000 // 单位 bitrate   //配置说明：

		this.config = options.config || {
			sdpSemantics: 'unified-plan',
			iceServers: [{
				urls: 'stun:stun.l.google.com:19302'
			}]
		};

		this.mergerParams = options.mergerParams || {
			width: 1280,
			height: 720,
			fps: 30
		};

		if (this.#timer) {
			clearInterval(this.#timer)
		}
	}

	async getLocalUserMedia() {
		return (await navigator.mediaDevices.getUserMedia({
			audio: true,
			video: true
		}))
	}



	/**
	 * @description merger videos and record to cloud
	 * @param {Object} videoElements
	 */
	async startStreamMerger(videoElements, type = "requestAnimation") {
		const that = this
		this.mergerStream = await this.composeVideos(videoElements, type)
		this.setVideoTrackContentHints(this.mergerStream, 'text')
		this.mergerStream.getTracks().forEach(track => {
			console.log(track)
		})
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
	async sendLocalRecord(mediaStream){
		this.#localRecorder = new LocalRecorder();
		await this.#localRecorder.startRecording(mediaStream);
	}
	/**
	 * @description 停止本地录制
	 * @returns { blob, videoUrl, totalTime }
	 */
	async stopLocalRecord(){
		// const { blob, videoUrl, totalTime } = await recorder.stopRecording();
		return await this.#localRecorder.stopRecording();
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
			res.forEach((report) => {

				// 入口宽带
				if (report.type === "inbound-rtp" && report.kind === "video" && report
					.bytesReceived) {
					const bytesReceived = report.bytesReceived;
					const now = report.timestamp;
					if (that.#lastBytesReceived && that.#lastTimestampFR) {
						let bf = bytesReceived - that.#lastBytesReceived;
						let t = now - that.#lastTimestampFR;
						const bitrate = (bf / 8 / t).toFixed(3);
						console.log(`当前入口宽带为：${bitrate} KB/s`);
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

						// 计算宽带并输出到控制台上bitrate 为 kbit/s -> bf/8
						const bitrate = (bf / 8 / t).toFixed(3);
						console.log(`当前出口宽带为：${bitrate} KB/s`);
					}

					// 更新上一次统计结果
					that.#lastBytesSend = bytesSent;
					that.#lastTimestampFS = now;
				}

			});
		});
	}
	statsBandwidth(pc) {
		const that = this
		if (!pc) {
			return
		}
		if (this.#timer) {
			clearInterval(this.#timer)
		}

		this.#timer = setInterval(() => {
			that.calculateReceiverBitrate(pc)
		}, 3000)

	}

	bandwidthConstraint(sdp, bandwidth) {
		let modifier = 'AS';
		// if (adapter.browserDetails.browser === 'firefox') {
		//   bandwidth = (bandwidth >>> 0) * 1000;
		//   modifier = 'TIAS';
		// }
		if (sdp.indexOf('b=' + modifier + ':') === -1) {
			// insert b= after c= line.
		 sdp = sdp.replace(/c=IN (.*)\r\n/, 'c=IN $1\r\nb=' + modifier + ':' + bandwidth + '\r\n');
		} else {
			sdp = sdp.replace(new RegExp('b=' + modifier + ':.*\r\n'), 'b=' + modifier + ':' + bandwidth + '\r\n');
		}
		return sdp;
	}

	async targetStreamToRemote(vTrack, aTrack) {
		this.pc = await new PeerConnection(this.config);
		this.pc.addTransceiver('audio', {
			direction: 'sendrecv'
		});
		this.pc.addTransceiver('video', {
			direction: 'sendrecv'
		});

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
			sdp: this.bandwidthConstraint(offer.sdp, this.bandwidth)
		}
		this.logger.info(resOffer.sdp);
		await this.pc.setLocalDescription(resOffer);
		this.sender = this.pc.addTrack(vTrack);
		const parameters = this.sender.getParameters();
		this.logger.info('sender parameters', parameters);
		this.pc.addTrack(aTrack);
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
			//scaleResolutionDownBy选项是指示浏览器是否自动降低视频分辨率的选项。
			if (this.pc.iceConnectionState === 'connected') {
				this.statsBandwidth(this.pc)
				setTimeout(async () => {
					const sender = this.pc.getSenders().find(s => s.track.kind === 'video');
					// const constraints = {
					//   width: {min: 640},
					//   height: {min: 480},
					//   frameRate: {min: 20,max:30}
					// };
					const parameters = sender.getParameters();
					if (!parameters.encodings) {
						parameters.encodings = [{}];
					}
					// delete parameters.encodings[0].scaleResolutionDownBy;
					parameters.encodings[0].maxBitrate = this.bandwidth;
					// parameters.encodings[0].networkPriority = 'high';
					// parameters.encodings[0].priority = 'high'
					// await sender.setParameters(parameters);
					console.log(sender.getParameters())
					// await sender.track.applyConstraints(constraints)
				}, 3000)

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
						sdp: this.bandwidthConstraint(result['sdp'], this.bandwidth)
					};
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
				throw new Error("交换SDP信令失败+" + res);
			}
			return res.data;
		} catch (err) {
			clearTimeout(timeoutId);
			this.logger.error(err);
			throw err;
		}
	}

}
