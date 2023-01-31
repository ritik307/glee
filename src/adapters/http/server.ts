import Adapter from "../../lib/adapter.js";
import GleeMessage from "../../lib/message.js";
import http from "http";
import { validateData } from "../../lib/util.js";
import GleeError from "../../errors/glee-error.js";
import * as url from "url";

class HttpAdapter extends Adapter {
  private res: any[] = [];

  name(): string {
    return "HTTP server";
  }

  async connect(): Promise<this> {
    return this._connect();
  }

  async send(message: GleeMessage): Promise<void> {
    return this._send(message);
  }

  _connect(): Promise<this> {
    return new Promise(async (resolve, reject) => {
      const config = await this.resolveProtocolConfig("http");
      const httpOptions = config?.server;
      const serverUrl = new URL(this.serverUrlExpanded);
      const httpServer = httpOptions?.httpServer || http.createServer((req, res) => {});
      const asyncapiServerPort = serverUrl.port || 80;
      const optionsPort = httpOptions?.port;
      const port = optionsPort || asyncapiServerPort;

      console.log("--channel names: ", this.channelNames);

      httpServer.on("request", (req, res) => {
        // ======================================
        const body = [];
        req.on("data", (chunk) => {
          body.push(chunk);
        });
        req.on("end", () => {
          req["body"] = Buffer.concat(body).toString();
          console.log("---request body", req.body);
        });
        // ======================================

        this.res.push(res);
        let { pathname } = new URL(req.url, serverUrl);
        pathname = pathname.startsWith("/") ? pathname.substring(1) : pathname;
        if (!this.parsedAsyncAPI.channel(pathname)) {
          res.end("HTTP/1.1 404 Not Found1\r\n\r\n");
          const err = new Error(
            `A client attempted to connect to channel ${pathname} but this channel is not defined in your AsyncAPI file. here`
          );
          this.emit("error", err);
          return reject(err);
        }
        const { query: searchParams } = url.parse(req.url, true);
        const httpChannelBinding = this.parsedAsyncAPI
          .channel(pathname)
          .binding("http");
        if (httpChannelBinding) {
          const { query, method } = httpChannelBinding;
          if (method && req.method !== method) {
            this.emit("error", new Error(`Cannot ${req.method} ${pathname}`));
            res.end("HTTP/1.1 400 Bad Request\r\n\r\n");
            return;
          }
          if (query) {
            const { isValid, humanReadableError, errors } = validateData(
              searchParams,
              query
            );
            if (!isValid) {
              const err = new GleeError({ humanReadableError, errors });
              console.log("ERROR", err);
              this.emit("error", err);
              res.end("HTTP/1.1 400 Bad Request\r\n\r\n");
              return;
            }
          }
        }
        this.emit("connect", {
          name: this.name(),
          adapter: this,
          connection: http,
          channel: pathname,
        });

        const msg = this._createMessage(pathname, searchParams);
        this.emit("message", msg, http);
      });

      httpServer.listen(port);
      this.emit("server:ready", { name: this.name(), adapter: this });

      resolve(this);
    });
  }

  async _send(message: GleeMessage): Promise<void> {
    this.res.forEach((res) => {
      res.write(message.payload);
      res.end();
    });
  }

  _createMessage(pathName: string, payload: any) {
    return new GleeMessage({
      payload: JSON.parse(JSON.stringify(payload)),
      channel: pathName,
    });
  }
}

export default HttpAdapter;
