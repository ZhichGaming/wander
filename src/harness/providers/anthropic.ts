import Anthropic from "@anthropic-ai/sdk";
import { Model, Provider } from "../provider";
import { Message } from "../agent";

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

    async run(messages: Message[]) {
        const stream = this.anthropic.messages.stream({
            model: this.model.id,
            max_tokens: 20000,
            messages: messages.map(this.toAnthropicMessage)
        });

        let result = "";
        for await (const chunk of stream) {
            if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
                result += chunk.delta.text;
            }
        }
        return result;
    }
}