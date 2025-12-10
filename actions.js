let mediaTypes = [
	{ id: '0', label: 'LocalVideo' },
	{ id: '1', label: 'LocalImage' },
	{ id: '2', label: 'CloudVideo' },
	{ id: '3', label: 'CloudImage' },
]

module.exports = function (self) {
	self.setActionDefinitions({
		play_action: {
			name: 'Play',
			options: [
				{
					// The ID of the media
					id: 'id',
					type: 'textinput',
					label: 'Media ID (found in Variables)',
					default: '0',
				},
				{
					// The type of media
					id: 'type',
					type: 'dropdown',
					label: 'Media Type (found in Variables)',
					default: '2',
					choices: mediaTypes,
				},
				{
					// Loop the media?
					id: 'loop',
					type: 'checkbox',
					label: 'Loop',
					default: false,
				},
				{
					// The amount of preparation time for devices in milliseconds before playback starts,
					// to ensure all devices are fully loaded before starting in-sync.
					id: 'playDelayMs',
					type: 'number',
					label: 'Play Delay (ms, default 5000)',
					default: 5000,
				},
			],
			callback: async (event) => {
				// VR Sync requires the actual string representation of the video type. We therefore obtain the label again from the type ID.
				self.playCommand(
					event.options.id,
					mediaTypes[event.options.type].label,
					event.options.loop,
					event.options.playDelayMs,
				)
			},
		},

		stop_action: {
			name: 'Stop',
			callback: async (event) => {
				self.stopCommand()
			},
		},

		sendTextMessage_action: {
			name: 'Send Text Message',
			options: [
				{
					id: 'message',
					type: 'textinput',
					label: 'Message',
					default: '',
				},
			],
			callback: async (event) => {
				self.sendTextMessage(event.options.message)
			},
		},

		calibrate_action: {
			name: 'Calibrate Viewpoint',
			callback: async (event) => {
				self.sendCalibrate()
			},
		},
	})
}
