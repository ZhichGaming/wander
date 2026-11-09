/**
 * Wander — Zhich, Yu, Justin
 * AI harness: lasso context capture, tool calling, streaming, and the
 * read/write canvas tools the model uses. Owner: Zhich.
 *
 * Placeholder.
 */

import Agent from "./agent";
import AnthropicProvider from "./providers/anthropic";

export default class Harness {
    private providers = {
        anthropic: new AnthropicProvider("claude-haiku-5-5"),
    }

    agent!: Agent;

    constructor() {
        this.load();
    }

    load() {
        // TODO: Implement load
        // Load providers file, load agent file

        this.agent = new Agent([], this.providers.anthropic);
    }

    save() {
        // const providers = this.providers;
        // for (const provider of providers) {
        //     provider.save();
        // }

        // TODO: Implement save
    }
}

export const harness = new Harness();
