import childProcess from 'child_process';
import { TextChannel } from 'discord.js';

import StatusWorker from './statusWorker';
import { Config } from '../../interfaces/config';

export default class MCServerProcess {
    private _server: childProcess.ChildProcessWithoutNullStreams;

    private _timeoutRunning = false;

    private _cachedSTD = '';

    private _running = false;

    constructor(
        private _consoleChannel: TextChannel,
        private _statusWorker: StatusWorker,
        private _config: Config
    ) {
        this._statusWorker.serverStopped();
    }

    public startMCServer() {
        if (this._running) {
            this._consoleChannel.send(':warning: Server is already running.');
            return;
        }
        this._running = true;
        this._consoleChannel.send(':orange_circle: Starting up...');
        this._server = childProcess.spawn('java', this._config.MCserverFlags, { cwd: this._config.MCserverPath });
        this._listenToEvents();
    }

    public sendCommand(cmd: string) {
        if (!this._running) {
            this._consoleChannel.send(':warning: The server is not running. Start it with `start`');
            return;
        }
        if (cmd.toLowerCase() === 'stop') {
            this._statusWorker.serverStopping();
        }
        this._server.stdin.write(cmd + '\n');
    }

    private _listenToEvents() {
        this._statusWorker.serverStarting();
        this._server.on('exit', () => {
            this._running = false;
            this._statusWorker.serverStopped();
        });

        this._server.stdout.on('data', (data: string) => this._log(data, false));
        this._server.stderr.on('data', (data: string) => this._log(data, true));
    }

    private _startTimeout() {
        this._timeoutRunning = true;
        setTimeout(() => {
            this._timeoutRunning = false;
            if (this._cachedSTD.length < 2000) {
                this._consoleChannel.send(this._cachedSTD);
            } else {
                console.log(this._cachedSTD);
                this._consoleChannel.send(':warning: Content to long to be sent. Logged to console instead.');
            }
            this._cachedSTD = '';
        }, 500);
    }

    private _log(data: string, error: boolean): void {
        const dataAsString = data.toString();
        if (dataAsString.includes('logged in with entity id')) {
            this._statusWorker.addPlayer();
        } else if (dataAsString.includes('left the game')) {
            this._statusWorker.removePlayer();
        } else if (dataAsString.includes('For help, type "help"')) {
            this._statusWorker.serverStarted();
        }
        this._cachedSTD += error ? `:no_entry_sign: ${dataAsString}` : dataAsString;
        if (!this._timeoutRunning) {
            this._startTimeout();
        }
    }

}