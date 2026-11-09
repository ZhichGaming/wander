/**
 * Wander — Zhich, Yu, Justin
 * AI agent: the main class for the AI agent.
 * Owner: Zhich.
 */

import { Provider } from "./provider";

export default class Agent {
    messages: Message[] = [];

    provider: Provider;

    constructor(messages: Message[], provider: Provider) {
        this.messages = messages;
        this.provider = provider;
    }

    async run() {
        return await this.provider.run(this.messages);
    }

    addMessage(message: Message) {
        this.messages.push(message);
    }

    getMessages() {
        return this.messages;
    }
}

export enum Role {
    USER = "user",
    ASSISTANT = "assistant",
    SYSTEM = "system",
    // TOOL = "tool",
}

export class Message {
    role: Role;
    content: string;

    constructor(role: Role, content: string) {
        this.role = role;
        this.content = content;
    }
}