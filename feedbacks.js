const { combineRgb } = require('@companion-module/base')

module.exports = async function (self) {
	self.setFeedbackDefinitions({
		ChannelState: {
			name: 'Connection Status',
			type: 'boolean',
			label: 'Connection Status',
			defaultStyle: {
				bgcolor: combineRgb(255, 255, 255),
				color: combineRgb(255, 0, 0),
			},
			callback: (feedback) => {
				console.log('Updating connection status feedback: ', self.vrSyncState.connected)
				if (self.vrSyncState.connected) {
					return true
				} else {
					return false
				}
			},
		},
	})
}
