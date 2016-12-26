
const config = require('./config.json');
//const config = require('./config.test.json');

const request = require('request');
const moment = require('moment');
const WebSocketClient = require('websocket').client;
const xcp = require('counterjs');
const Twitter = require('twitter');

const log = function(text) {
	const write = '['+moment().format('YYYY/MM/DD HH:mm:ss.SS')+'] ' + text;
	console.log(write);
}

const tw = new Twitter(config.twitter);

const tweet = function(text) {
	log('sending tweet: ' + text);
	tw.post('statuses/update', {status: text}, function(err, tweet, res) {
		if(err) throw err;
	});
}

const explorer = new WebSocketClient();
explorer.on('connect', function(conn) {
	log('connected to BlockExplorer endpoint.');
	conn.on('error', function(err) {
		log('some errors occured at connection between BlockExplorer: ' + err.toString());
	});
	conn.on('close', function() {
		log('connection to BlockExplorer closed.');
	});
	conn.on('message', function(msg) {
		const json = JSON.parse(msg.utf8Data);
		// Checks if the first output is in the watch list.
		// XXX: do not assume OP_RETURN datatype!
		do {
			if(!json.hash) continue;
			log(json.hash);
			if(!json.outputs[0].addresses) continue;
			const found = config.watch.addresses[json.outputs[0].addresses[0]];
			if(!found) continue;
			log('output matches to '+json.outputs[0].addresses[0]);
			if(!found.messages.receive) continue;
			if(json.outputs[1].script_type != 'null-data') continue;
			// Parse embeded message.
			const key = new Buffer(json.inputs[0].prev_hash, 'hex');
			try {
				const msg = xcp.Message.fromEncrypted(key, new Buffer(json.outputs[1].data_hex, 'hex'));
				const parsed = msg.parse();
				console.log(parsed);
				if(parsed.type != 'Send') continue;
				console.log(config.watch.templates);
				const text = (config.watch.templates.messages.receive.before + found.messages.receive + config.watch.templates.messages.receive.after)
					.replace(/@AMOUNT@/g, 1e-8 * parsed.data.quantity.toNumber())
					.replace(/@COIN@/g, parsed.data.asset_id)
					.replace(/@SENDER@/, json.inputs[0].addresses[0])
					.replace(/@RECEIVER@/, json.outputs[0].addresses[0]);
				tweet(text);
			} catch(e) {
				log('failed to parse possibly Counterparty transaction: ' + e.toString());
				console.log(e.stack);
			}
		} while(false);
	});
	conn.send(JSON.stringify({
		event: 'unconfirmed-tx',
		token: config.blockexplorer.token,
	}));
	setInterval(function() {
		conn.send(JSON.stringify({event: 'ping'}));
	}, 20000);
});
explorer.connect(config.blockexplorer.websocket);

