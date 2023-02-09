import { AsyncAPIDocument, Server } from "@asyncapi/parser"
import EventEmitter from "events"
import uriTemplates from "uri-templates"
import GleeConnection from "./connection.js"
import Glee from "./glee.js"
import axios from "axios"

export type EnrichedEvent = {
  connection?: GleeConnection;
  serverName: string;
  server: Server;
};

class HttpEventEmitter extends EventEmitter {
  private _glee: Glee
  private _serverName: string
  private _AsyncAPIServer: Server
  private _parsedAsyncAPI: AsyncAPIDocument
  private _channelNames: string[]
  private _connections: GleeConnection[]
  private _serverUrlExpanded: string
  /**
   * Instantiates a Glee adapter.
   *
   * @param {Glee} glee  A reference to the Glee app.
   * @param {String} serverName  The name of the AsyncAPI server to use for the connection.
   * @param {AsyncAPIServer} server  The AsyncAPI server to use for the connection.
   * @param {AsyncAPIDocument} parsedAsyncAPI The AsyncAPI document.
   */
  constructor(
    glee: Glee,
    serverName: string,
    server: Server,
    parsedAsyncAPI: AsyncAPIDocument
  ) {
    super()

    this._glee = glee
    this._serverName = serverName
    this._AsyncAPIServer = server

    this._parsedAsyncAPI = parsedAsyncAPI
    this._channelNames = this._parsedAsyncAPI.channelNames()
    this._connections = []

    const uriTemplateValues = new Map()
    process.env.GLEE_SERVER_VARIABLES?.split(",").forEach((t) => {
      const [localServerName, variable, value] = t.split(":")
      if (localServerName === this._serverName)
        {uriTemplateValues.set(variable, value)}
    })
    this._serverUrlExpanded = uriTemplates(this._AsyncAPIServer.url()).fill(
      Object.fromEntries(uriTemplateValues.entries())
    )

    this.on("message", (message) => {
      console.log("--message: ", message)
    })
    this.on("send", async (data) => {
      const method = data.method //get post put
      const url = data.url
      const body = data.body
      const query = data.query
      const response = await axios({
        method,
        url,
        data: body,
        params: query,
      })
    })


    function enrichEvent(ev): EnrichedEvent {
      return {
        ...ev,
        ...{
          serverName,
          server,
        },
      }
    }
  }
  get glee(): Glee {
    return this._glee
  }

  get serverName(): string {
    return this._serverName
  }

  get AsyncAPIServer(): Server {
    return this._AsyncAPIServer
  }

  get parsedAsyncAPI(): AsyncAPIDocument {
    return this._parsedAsyncAPI
  }

  get channelNames(): string[] {
    return this._channelNames
  }

  get connections(): GleeConnection[] {
    return this._connections
  }

  get serverUrlExpanded(): string {
    return this._serverUrlExpanded
  }

  async resolveProtocolConfig(protocol: string) {
    if(!this.glee.options[protocol]) return undefined
    const protocolConfig = {...this.glee.options[protocol]}
    const resolve = async (config: any) => {
      for (const key in config) {
        if (typeof config[key] === 'object' && !Array.isArray(config[key])) {
          resolve(config[key])
        } else if (typeof config[key] === 'function') {
          config[key] = await config[key]()
        }
      }
    }

    await resolve(protocolConfig)
    return protocolConfig
  }
  getSubscribedChannels(): string[] {
    return this._channelNames
      .filter(channelName => {
        const channel = this._parsedAsyncAPI.channel(channelName)
        if (!channel.hasPublish()) return false

        const channelServers = channel.hasServers() ? channel.servers() : channel.ext('x-servers') || this._parsedAsyncAPI.serverNames()
        return channelServers.includes(this._serverName)
      })
  }
  async send(): Promise<any> {
    throw new Error('Method `send` is not implemented.')
  }
}
export default HttpEventEmitter
