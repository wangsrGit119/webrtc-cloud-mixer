
## webrtc-cloud-mixer 快速开始 

### 安装

```
npm install webrtc-cloud-mixer
```

### 引入

```
import {WebRTCRecorder} from 'webrtc-cloud-mixer'

```
### 配置说明

| 字段   |   字段说明|
|:-:|:-:| 
| api| 远程服务端API|
|logger| 是否开启日志| 
|recordMic| 是否录制麦克风,如果不开启音频默认为视频的混音，开启后则会同时录制麦克分声音到混合音频| 
|config| webrtc协商类型、stun服务地址、turn服务地址等配置，遵循原生[ PeerConnection(configuration) ](https://developer.mozilla.org/zh-CN/docs/Web/API/RTCPeerConnection/RTCPeerConnection)参数配置| 
|mergerParams| 合成输出基础配置| 
|videoElements|要合并的video元素，内部参数为布局，数组第一个元素为主要画面也就是底层铺满画面|


### 示例

#### 初始化
```
let recorder = new WebRTCRecorder({
	api: 'http://127.0.0.1:18090', // 远程服务端API
	logger: true, // 是否开启日志
	recordMic: false, // 是否录制麦克分
	config: { 
	  sdpSemantics: 'unified-plan',
	  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] 
	}, // webrtc ice servers 配置 
	mergerParams: {
	  width: 1920,
	  height: 1080,
	  fps: 30
	  
	} //合成输出参数配置
  })
  console.log(recorder)
  
  
```
#### 画面合成

```
let videoElements = [
	{
	  type: 'mp4',
	  dom: document.getElementById('localmeidastream'),   // 固定视频dom
	  x: 0,
	  y: 0,
	  width: recorder.mergerParams.width,
	  height: recorder.mergerParams.height,
	  mute: true
	},
	{
	  type: 'mp4',
	  dom: document.getElementById('staticmeidastream'),   // 动态视频dom
	  x: 100,   // x坐标
	  y: 100,   // y坐标
	  width: 200,   // 宽度
	  height: 200,  // 高度
	  mute: false
	},
	{
	  type: 'mp4',
	  dom: document.getElementById('staticmeidastream'),   // 动态视频dom
	  x: recorder.mergerParams.width-200,   // x坐标
	  y: recorder.mergerParams.height-200,   // y坐标
	  width: 200,   // 宽度
	  height: 200,  // 高度
	  mute: false
	}
  ]
  //开始合成
  await recorder.startStreamMerger(videoElements,'requestAnimation')
  
  //获取合成视频 mediaStream
  console.log(recorder.mergerStream)
  
  //将合成指定stream 投射到指定 video元素 【mergerVideoDom】为自定义video标签 ID
  recorder.setDomVideoStream('mergerVideoDom',recorder.mergerStream)
  
```

#### 本地录制

> 本地录制不需要配置API，录制全在本地浏览器中进行

```
//开启画面合成
await recorder.startStreamMerger(videoElements, 'requestAnimation')
//开启本地录制
await recorder.sendLocalRecord(recorder.mergerStream)
//10s后结束录制并获取录制的流以及录制时常
setTimeout(async () => {
	const { blob, videoUrl, totalTime } = await recorder.stopLocalRecord()
	console.log(blob, videoUrl, totalTime)
	//本地预览 <video id="remoteRecordVideo" :src="localRecordVideoUrl" controls width="600" height="300" autoplay></video>
	that.localRecordVideoUrl = videoUrl
},10000)
await recorder.sendRemoteRecord(recorder.mergerStream)
```


#### 远程录制

> 远程录制的前提是前面合成画面已经开始合成；同时必须配置远程的API才可以用

```
await recorder.sendRemoteRecord(recorder.mergerStream)
```