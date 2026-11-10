import { Message, Tool, ToolCall } from "../agent";

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
    text: string | undefined;
    tools: ToolCall[];
    error: string | undefined;

    constructor(text: string | undefined, tools: ToolCall[] | undefined, error: string | undefined) {
        this.text = text ?? undefined;
        this.tools = tools ?? [];
        this.error = error ?? undefined;
    }
}