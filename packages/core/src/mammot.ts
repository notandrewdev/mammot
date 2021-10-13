import {
	Client as DiscordClient,
	ClientOptions,
	Snowflake,
	ClientUser,
	ApplicationCommandDataResolvable,
} from 'discord.js';
import {OptionMetadata} from '.';
import {Command, ConstructableCommand} from './command';
import {MammotError} from './errots';
import {readCommand} from './reflection';

export interface MammotOptions extends ClientOptions {
	developmentGuild: Snowflake;
	ready(user: ClientUser): Promise<void> | void;
}

interface ParsedCommand {
	name: string;
	description: string;
	command: Command;
	options: OptionMetadata[];
}

/**
 * The client for the bot.
 */
export class Mammot {
	public static client(options: MammotOptions) {
		return new Mammot(options);
	}

	public readonly commands: Map<string, ParsedCommand> = new Map();

	public readonly client: DiscordClient<true>;
	private readonly developmentGuild;

	private constructor(options: MammotOptions) {
		const {developmentGuild, ready, ...rest} = options;
		this.client = new DiscordClient(rest);

		this.developmentGuild = developmentGuild;
		this.client.once('ready', async () => {
			await ready(this.client.user);

			await this.client.application.commands.set(
				[...this.commands.values()].map(
					(command): ApplicationCommandDataResolvable => ({
						options: command.options.map(option => ({
							type: option.config.type,
							required: option.config.required,
							description: option.config.description ?? 'no description',
							name: option.name,
						})),
						name: command.name,
					}),
				),
			);
		});
	}

	/**
	 * Registers a command.
	 * @param commands Commands to register.
	 * @returns The client.
	 */
	public addCommands<
		// Guarantee at least one item in array with these generics
		V extends ConstructableCommand,
		T extends readonly [V, ...V[]],
	>(commands: T) {
		const mapped = commands.map(Cmd => new Cmd(this));

		for (const command of mapped) {
			const {name, description, options} = readCommand(command);

			this.commands.set(name, {
				description,
				name,
				options,
				command,
			});
		}

		return this;
	}

	public async login(token?: string) {
		this.client.on('interaction', interaction => {
			if (!interaction.isCommand()) {
				return;
			}

			const found = this.commands.get(interaction.commandName);

			if (!found) {
				return;
			}

			const {command, options} = found;

			try {
				void command.run(
					interaction,
					...Command.resolveMetadata(interaction, options),
				);
			} catch (error: unknown) {
				const message =
					error instanceof MammotError
						? error.message
						: 'Something went wrong!';

				void interaction.reply({
					ephemeral: true,
					content: message,
				});
			}
		});

		return this.client.login(token);
	}
}
