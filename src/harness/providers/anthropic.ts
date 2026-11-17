import Anthropic from "@anthropic-ai/sdk";
import { Model, Provider, ProviderResponse } from "./provider";
import { Message, Part, Role, TextPart, Thinking, Tool, ToolCall } from "../agent";

export default class AnthropicProvider implements Provider {
    private anthropic: Anthropic;

    models: Model[] = [
        { 
            name: "Claude Haiku 5.5",
            id: "claude-haiku-5-5",
            description: "Cheap and cheerful model for quick tasks",
        },
    ];

    model: Model;

    constructor(model: string) {
        this.model = this.models.find(m => m.id === model) ?? this.models[0];
        this.anthropic = new Anthropic();
    }

    private toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
        const out: Anthropic.MessageParam[] = [];
        for (const m of messages) {
            if (m.role === Role.ASSISTANT) {
                const content = m.parts.flatMap(p => this.toAnthropicBlock(p));
                out.push({ role: "assistant", content });
            } else if (m.role === Role.TOOL) {
                const block: Anthropic.ToolResultBlockParam = {
                    type: "tool_result",
                    tool_use_id: m.toolCallId!,
                    content: m.images.length === 0 ? m.content : [
                        { type: "text", text: m.content },
                        ...m.images.map(img => ({
                            type: "image" as const,
                            source: { type: "base64" as const, media_type: img.mediaType, data: img.data },
                        })),
                    ],
                    is_error: m.isError,
                };
                // Anthropic wants every result for one turn in a single user message.
                const last = out[out.length - 1];
                if (last?.role === "user" && Array.isArray(last.content) && last.content[0]?.type === "tool_result")
                    last.content.push(block);
                else
                    out.push({ role: "user", content: [block] });
            } else if (m.role === Role.USER) {
                out.push({ role: "user", content: m.content });
            } else if (m.role === Role.SYSTEM) {
                // Leading system messages go to the top-level `system` field instead.
                if (out.length > 0) out.push({ role: "system", content: m.content });
            }
        }
        return out;
    }

    // Blocks go back exactly as the API returned them. Thinking without a
    // signature (from another provider) can't be verified, so it's dropped.
    private toAnthropicBlock(part: Part): Anthropic.ContentBlockParam[] {
        switch (part.type) {
            case "text":
                return [{ type: "text", text: part.text }];
            case "tool_call":
                return [{ type: "tool_use", id: part.id, name: part.name, input: part.arguments }];
            case "thinking":
                if (!part.signature) return [];
                return [part.redacted
                    ? { type: "redacted_thinking", data: part.signature }
                    : { type: "thinking", thinking: part.text, signature: part.signature }];
        }
    }

    private fromAnthropicBlock(block: Anthropic.ContentBlock): Part[] {
        switch (block.type) {
            case "text": return [new TextPart(block.text)];
            case "tool_use": return [new ToolCall(block.id, block.name, block.input)];
            case "thinking": return [new Thinking(block.thinking, block.signature)];
            case "redacted_thinking": return [new Thinking("", block.data, true)];
            default: return [];
        }
    }

    // Only the system messages before the conversation starts. Later ones stay in
    // `messages` so adding one doesn't change the cached prefix.
    private toAnthropicSystem(messages: Message[]): string | undefined {
        const leading = messages.findIndex(m => m.role !== Role.SYSTEM);
        const system = messages.slice(0, leading === -1 ? messages.length : leading)
            .map(m => m.content).join("\n\n");
        return system || undefined;
    }

    private toAnthropicTools(tools: Tool[]): Anthropic.Tool[] {
        return tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: {
                type: "object",
                properties: tool.argsToObject(),
                required: tool.arguments.filter(arg => arg.required).map(arg => arg.name),
            },
        }));
    }

    async run(messages: Message[], tools?: Tool[]) {
        const response = await this.anthropic.messages.create({
            model: this.model.id,
            max_tokens: 20000,
            system: this.toAnthropicSystem(messages),
            messages: this.toAnthropicMessages(messages),
            tools: tools ? this.toAnthropicTools(tools) : [],
            thinking: { type: "adaptive", display: "summarized" },
        });

        return new ProviderResponse(response.content.flatMap(block => this.fromAnthropicBlock(block)));
    }
}