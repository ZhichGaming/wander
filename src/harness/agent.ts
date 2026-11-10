/**
 * Wander — Zhich, Yu, Justin
 * AI agent: the main class for the AI agent.
 * Owner: Zhich.
 */

import { Provider } from "./providers/provider";

export default class Agent {
    messages: Message[] = [];
    tools: Tool[] = [];

    TURN_LIMIT: number = 10;

    provider: Provider;

    constructor(messages: Message[], provider: Provider, tools: Tool[]) {
        this.messages = messages;
        this.provider = provider;
        this.tools = tools;
    }

    async run() {
        for (let i = 0; i < this.TURN_LIMIT; i++) {
            const response = await this.provider.run(this.messages);
            if (response.text) 
                this.messages.push(new Message(Role.ASSISTANT, response.text));
            // if (response.tools.length > 0) {
            //     this.messages.push(new Message(Role.TOOL, response.tools[0].name, response.tools[0].arguments));
            // }
        }
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

export class Tool {
    name: string;
    description: string;
    arguments: Argument[];
    func: (...args: any[]) => any;

    constructor(name: string, description: string, args: Argument[], func: (...args: any[]) => any) {
        this.name = name;
        this.description = description;
        this.arguments = args;
        this.func = func;
    }

    argsToObject(): any {
        return Object.fromEntries(this.arguments.map(arg => [arg.name, arg.toObject()]));
    }
}

export class Argument {
    name: string;
    description: string;
    required: boolean;
    type: ArgumentType;
    // For object type
    properties?: Argument[];
    // For array type
    items?: Argument;

    constructor(name: string, description: string, required: boolean, type: ArgumentType, properties?: Argument[], items?: Argument) {
        this.name = name;
        this.description = description;
        this.required = required;
        this.type = type;
        this.properties = properties;
        this.items = items;
    }

    getRequired(): string[] | undefined {
        return this.properties?.filter(arg => arg.required).map(arg => arg.name);
    }

    toObject(): any {
        return {
            description: this.description,
            type: this.type,
            properties: this.properties && 
                Object.fromEntries(
                    this.properties.map(arg => [arg.name, arg.toObject()])
                ),
            items: this.items?.toObject(),
            required: this.getRequired(),
        };
    }
}

export enum ArgumentType {
    STRING = "string",
    NUMBER = "number",
    BOOLEAN = "boolean",
    ARRAY = "array",
    OBJECT = "object",
}

export class ToolCall {
    name: string;
    arguments: any;

    constructor(name: string, args: any) {
        this.name = name;
        this.arguments = args;
    }
}