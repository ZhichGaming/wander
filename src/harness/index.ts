/**
 * Wander — Zhich, Yu, Justin
 * AI harness: lasso context capture, tool calling, streaming, and the
 * read/write canvas tools the model uses. Owner: Zhich.
 *
 * Placeholder.
 */

import { CanvasEngine } from "../canvas-engine";
import Agent, { Tool } from "./agent";
import AnthropicProvider from "./providers/anthropic";
import { viewTools } from "./tools";

export default class Harness {
    private providers = {
        anthropic: new AnthropicProvider("claude-haiku-5-5"),
    }

    engine: CanvasEngine;

    tools: Tool[] = [];
    agent!: Agent;

    constructor(engine: CanvasEngine) {
        this.engine = engine;
        this.tools = viewTools(engine);
        this.load();
    }

    load() {
        // TODO: Implement load
        // Load providers file, load agent file

        this.agent = new Agent([], this.providers.anthropic, this.tools);
    }

    save() {
        // const providers = this.providers;
        // for (const provider of providers) {
        //     provider.save();
        // }

        // TODO: Implement save
    }
}
