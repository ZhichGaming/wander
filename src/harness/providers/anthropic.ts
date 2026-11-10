import Anthropic from "@anthropic-ai/sdk";
import { Model, Provider, ProviderResponse } from "./provider";
import { Message, Tool, ToolCall } from "../agent";

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

    private toAnthropicMessage(message: Message) {
        return {
            role: message.role,
            content: message.content
        };
    }

    private toAnthropicTools(tools: Tool[]) {
        return tools.map(tool => tool.argsToObject());
    }

    async run(messages: Message[], tools?: Tool[]) {
        const response = await this.anthropic.messages.create({
            model: this.model.id,
            max_tokens: 20000,
            messages: messages.map(this.toAnthropicMessage),
            tools: tools ? this.toAnthropicTools(tools) : []
        });

        const text = response.content.find(content => content.type === "text")?.text ?? "";
        const toolCalls = response.content.filter(content => content.type === "tool_use")
            .map(content => new ToolCall(content.name, content.input));

        return {
            text: text,
            tools: toolCalls,
            error: undefined
        } as ProviderResponse;
    }
}