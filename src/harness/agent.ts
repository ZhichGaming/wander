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
            const response = await this.provider.run(this.messages, this.tools);
            this.messages.push(Message.assistant(response.parts));

            if (response.tools.length === 0) return;

            for (const call of response.tools)
                this.messages.push(await this.runTool(call));
        }
    }

    private async runTool(call: ToolCall): Promise<Message> {
        const tool = this.tools.find(t => t.name === call.name);
        if (!tool)
            return new Message(Role.TOOL, `Unknown tool: ${call.name}`, call.id, true);
        try {
            const result = await tool.func(call.arguments);
            const content = typeof result === "string" ? result : JSON.stringify(result) ?? "";
            return new Message(Role.TOOL, content, call.id);
        } catch (e) {
            return new Message(Role.TOOL, String(e), call.id, true);
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
    TOOL = "tool",
}

export class Message {
    role: Role;
    // The message text. On ASSISTANT messages, all text parts joined.
    content: string;
    // ASSISTANT only: the response in the exact order the model produced it.
    parts: Part[];
    // TOOL only: the call this message is the result of.
    toolCallId?: string;
    isError: boolean;

    constructor(role: Role, content: string, toolCallId?: string, isError = false, parts: Part[] = []) {
        this.role = role;
        this.content = content;
        this.toolCallId = toolCallId;
        this.isError = isError;
        this.parts = parts;
    }

    static assistant(parts: Part[]): Message {
        return new Message(Role.ASSISTANT, textOf(parts), undefined, false, parts);
    }

    get toolCalls(): ToolCall[] {
        return toolCallsOf(this.parts);
    }
}

export type Part = TextPart | Thinking | ToolCall;

export class TextPart {
    readonly type = "text";
    text: string;

    constructor(text: string) {
        this.text = text;
    }
}

export function textOf(parts: Part[]): string {
    return parts.filter((p): p is TextPart => p.type === "text").map(p => p.text).join("");
}

export function toolCallsOf(parts: Part[]): ToolCall[] {
    return parts.filter((p): p is ToolCall => p.type === "tool_call");
}

export class Thinking {
    readonly type = "thinking";
    // Readable reasoning; empty when the provider hides or redacts it.
    text: string;
    // Opaque provider data that must be sent back as is (a signature, encrypted reasoning).
    signature?: string;
    // The provider withheld the reasoning; only `signature` carries it.
    redacted: boolean;

    constructor(text: string, signature?: string, redacted = false) {
        this.text = text;
        this.signature = signature;
        this.redacted = redacted;
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
    readonly type = "tool_call";
    id: string;
    name: string;
    arguments: any;

    constructor(id: string, name: string, args: any) {
        this.id = id;
        this.name = name;
        this.arguments = args;
    }
}