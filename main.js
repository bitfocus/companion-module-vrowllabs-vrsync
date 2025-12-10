const { io } = require('socket.io-client')
const { randomUUID } = require('crypto')
const { InstanceBase, Regex, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')
const UpdateVariableDefinitions = require('./variables')

class VRSyncModuleInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	async init(config) {
		this.vrSyncState = {}
		this.vrSyncState.connected = false

		// Companion initialization
		this.config = config
		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updateVariableDefinitions() // export variable definitions

		// Start connecting to VR Sync
		this.openSocket()
	}

	// When module gets deleted
	async destroy() {
		if (this.socket) {
			this.socket.disconnect()
		}
		this.log('debug', 'destroy')
	}

	async configUpdated(config) {
		console.log('config updated: ', config)
		this.socket.disconnect()
		this.config = config
		this.init(config)
	}

	// Return config fields for web config
	getConfigFields() {
		return [
			{
				// The url or ip of the VR Sync server to connect to.
				// If you don't know your url/ip, please contact support@vr-sync.com.
				type: 'textinput',
				id: 'host',
				label: 'VR Sync Server IP',
				width: 8,
				default: 'http://172.28.1.9', // The default VR Sync Box IP.
			},
			{
				// The port of the VR Sync server to connect to.
				// If you don't know your port, please contact support@vr-sync.com.
				type: 'textinput',
				id: 'port',
				label: 'VR Sync Server Port',
				width: 4,
				regex: Regex.PORT,
				default: 7327, // The default VR Sync Box port.
			},
			{
				// Your VR Sync license key
				type: 'textinput',
				id: 'licenseKey',
				label: 'License Key',
				width: 12,
			},
			{
				// Whether to log all incoming messages to the plugin from VR Sync. Recommended to use for debugging purposes only.
				type: 'checkbox',
				id: 'logIncomingMessages',
				label: 'Log all incoming messages for debugging',
				default: false,
			},
			{
				// Whether to log all outgoing messages to the plugin from VR Sync.
				// These logs will contain your license key! Recommended to use for debugging purposes only.
				type: 'checkbox',
				id: 'logOutgoingMessages',
				label: 'Log all outgoing messages for debugging. Careful, they will contain your license key!',
				default: false,
			},
		]
	}

	updateActions() {
		UpdateActions(this)
	}

	updateFeedbacks() {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions() {
		UpdateVariableDefinitions(this)
	}

	openSocket() {
		let serverUrl = `${this.config.host}:${this.config.port}`
		console.log('Connnecting to ', serverUrl)

		this.socket = io(serverUrl, {
			autoConnect: false,
			reconnectionDelayMax: 10000,
			forceNew: true,
			transports: ['websocket'],
		})

		this.socket.on('connect', () => {
			this.onConnect()
		})
		
		this.socket.on('disconnect', (reason) => {
			this.onDisconnect(reason)
		})
		
		this.socket.on('message', (message) => {
			this.messageReceived(message)
		})

		// Show initial connnecting status in Companion Connection page
		this.updateStatus(InstanceStatus.Connecting)
		this.socket.open()
	}

	onConnect() {
		this.vrSyncState.connected = true

		// Update visuals in Companion to reflect the connected state
		console.log('Connected to VR Sync')
		this.updateStatus(InstanceStatus.Ok, 'Connected')
		this.checkFeedbacks()

		this.ping()

		// The VR Sync server requires a custom heartbeat message at most every 5 seconds, otherwise it will disconnect the client.
		this.vrSyncState.pingInterval = setInterval(this.ping.bind(this), 3000)
	}

	onDisconnect(reason) {
		this.vrSyncState.connected = false

		// Update visuals in Companion to reflect the disconnected state
		console.log('Disconnected from VR Sync')
		this.checkFeedbacks()
		
		// Use warning instead of error, so the error status remains reserved for crashes and such.
		this.updateStatus(InstanceStatus.Disconnected)

		// Stop pinging
		clearInterval(this.vrSyncState.pingInterval)

		// This happens when the server closes the socket.
		// Version 2.0.2 of socket.io does not automatically reconnect when this happens.
		if (reason === 'io server disconnect') {
			this.socket.open()
		}
	}

	sendMessage(message) {
		((message.sender = 'Admin'),
			(message.licenseCode = this.config.licenseKey),
			(message.protocolVersion = 2),
			(message.sentUnixTimestampMs = new Date().getTime()))

		if (this.config.logOutgoingMessages) {
			console.log('Sending message: ', JSON.stringify(message))
		}

		this.socket.emit('message', message)
	}

	ping() {
		const ping = {
			type: 'Ping',
		}
		this.sendMessage(ping)
	}

	playCommand(mediaID, type, loop, playDelayMs) {
		console.log('Playing media id:', mediaID, type, loop, playDelayMs)

		this.sendCommand([{ type: type, identifier: mediaID.toString(), playDelayMs: playDelayMs }], loop)

		this.clearPlayStartedTimeout()
		
		// In order to link actions to the actual start time of a playback command, we use a variable containing a GUID.
		// You can use the variable changed Trigger in Companion to attach actions to it.
		if (playDelayMs > 0) {
			this.vrSyncState.playStartedInterval = setTimeout(this.playStarted.bind(this), playDelayMs)
		} else {
			playStarted()
		}
	}

	stopCommand() {
		console.log('Stopping media')
		// A stop command is the same as a play command, but with an empty playlist
		this.sendCommand([], false)
		this.clearPlayStartedTimeout()
	}

	clearPlayStartedTimeout() {
		if (this.vrSyncState.playStartedInterval) {
			clearTimeout(this.vrSyncState.playStartedInterval)
		}
	}

	playStarted() {
		this.setVariableValues({
			playStartedTrigger: randomUUID(),
		})
	}

	sendCommand(playlist, _loop) {
		const command = {
			type: 'Command',
			currentTime: 0,
			playlist: playlist,
			loop: _loop,
			deviceUIDs: ['all'],
		}

		this.sendMessage(command)
	}

	sendTextMessage(message) {
		console.log('Sending text message: ', message)

		const command = {
			type: 'Text',
			text: message,
			lengthInMs: 5000,
			currentTime: 0,
			deviceUIDs: ['all'],
		}
		this.sendMessage(command)
	}

	sendCalibrate() {
		console.log('Calibrating Viewpoint')
		const calibrateMessage = {
			type: 'Calibrate',
		}
		this.sendMessage(calibrateMessage)
	}

	messageReceived(message) {
		if (this.config.logIncomingMessages) {
			console.log('Received message: ', JSON.stringify(message))
		}

		if (message.type === 'Ping' && message.sender === 'Server') {
			this.serverPingReceived(message)
		} else if (message.type === 'MediaUpdate') {
			this.mediaUpdateReceived(message)
		} else if (message.type === 'StatusUpdate') {
			this.statusUpdateReceived(message)
		} else if (message.type === 'CommandHistory') {
			this.commandHistoryReceived(message)
		} else if (message.type === 'Error') {
		} else if (message === 'not authenticated') {
			// This is the legacy error message.
		}
	}

	serverPingReceived(message) {
		this.vrSyncState.isTrial = message.isTrial
		this.vrSyncState.userLimit = message.userLimit
		this.vrSyncState.serverVersion = message.serverVersion
		this.vrSyncState.minimumVersion = message.minimumVersion
		this.vrSyncState.preferredVersion = message.preferredVersion
		this.vrSyncState.connected = true
	}

	mediaUpdateReceived(message) {
		this.vrSyncState.media = message.media
		let media = []
		for (let i = 0; i < message.media.length; i++) {
			media.push(message.media[i].type + ' ' + message.media[i].identifier + ': ' + message.media[i].mediaName)
		}
		this.setVariableValues({
			media: media,
		})
	}

	statusUpdateReceived(message) {
		// Left empty for future development
		// Contains information about the connected VR Sync Clients
	}

	commandHistoryReceived(message) {
		// Left empty for future development
		// Contains information about the latest sent command,
		// useful if you want to show playback status but the Companion module had disconnected during playback.
	}
}

runEntrypoint(VRSyncModuleInstance, UpgradeScripts)
