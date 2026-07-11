export interface Command<T = any> {
    type: string;
    payload?: T;
}

export type CommandHandler<T extends Command = any, R = any> = (command: T) => Promise<R>;

export class CommandBus {
    private handlers = new Map<string, CommandHandler>();

    register<T extends Command, R>(type: string, handler: CommandHandler<T, R>): void {
        this.handlers.set(type, handler);
    }

    async dispatch<R>(command: Command): Promise<R> {
        const handler = this.handlers.get(command.type);
        if (!handler) {
            throw new Error(`CommandBus Error: No handler registered for command: ${command.type}`);
        }
        return await handler(command);
    }
}
