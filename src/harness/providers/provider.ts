import { Message, Part, Tool, ToolCall, textOf, toolCallsOf } from "../agent";

export interface Provider {
    models: Model[];
    model: Model;

    run(messages: Message[], tools?: Tool[]): Promise<ProviderResponse>;

}

// export type StreamEventType = "message_start" | "message_delta" | "message_stop" | "content_block_start" | "content_block_delta" | "content_block_stop";
// export class StreamEvent {
//     type: StreamEventType;
//     data: any;

//     constructor(type: StreamEventType, data: any) {
//         this.type = type;
//         this.data = data;
//     }
// }

export class Model {
    id: string;
    name: string;
    description: string;

    constructor(name: string, id: string, description: string) {
        this.name = name;
        this.id = id;
        this.description = description;
    }
}

export class ProviderResponse {
    // The response in the exact order the model produced it.
    parts: Part[];
    error: string | undefined;

    constructor(parts: Part[], error?: string) {
        this.parts = parts;
        this.error = error;
    }

    get text(): string {
        return textOf(this.parts);
    }

    get tools(): ToolCall[] {
        return toolCallsOf(this.parts);
    }
}