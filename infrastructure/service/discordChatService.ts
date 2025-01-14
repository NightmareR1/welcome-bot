import { Client, Collection, Message, MessageCollector, MessageEmbed, ThreadChannel } from "discord.js";
import { ChannelTypes } from "discord.js/typings/enums";
import { v4 as uuidv4 } from "uuid";
import ChatService from "../../domain/service/chatService";
import Channel from "../../domain/entity/channel";
import EmbedMessage from "../../domain/entity/embedMessage";
import User from "../../domain/entity/user";
import LoggerService from "../../domain/service/loggerService";

export default class DiscordChatService implements ChatService {
  constructor(private client: Client) {}

  async sendMessageToChannel(message: string, channelId: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);

    if (channel === null) {
      throw new Error(`Channel with id ${channelId} not found!`);
    }

    if (!channel.isText()) {
      throw new Error(`Channel with id ${channelId} is not a text channel!`);
    }

    channel.send(message);
  }

  async sendMessageEmbedToChannel(
    loggerService: LoggerService,
    embed: EmbedMessage,
    channelId: string,
    guildId: string,
    user: User
  ): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    const guild = await this.client.guilds.fetch(guildId);
    const author = (await guild.members.fetch(user.id)).user;
    if (channel === null) {
      throw new Error(`Channel with id ${channelId} not found!`);
    }

    if (!channel.isText()) {
      throw new Error(`Channel with id ${channelId} is not a text channel!`);
    }
    const messageEmbed = new MessageEmbed()
      .setColor(embed.color)
      .setTitle(embed.title)
      .setAuthor({
        name: embed.author.name,
        iconURL: embed.author.iconURL,
      })
      .setDescription(embed.description)
      .addFields(embed.fields)
      .setTimestamp(embed.timestamp)
      .setFooter(embed.footer);
    channel.send({ embeds: [messageEmbed] }).then((m: Message) => {
      m.react("👍");
      m.react("👎");
      m.startThread({
        name: `${author.username}`,
      }).then((thread: ThreadChannel) => {
        thread.send(`Thread automatically created by ${author.username} in <#${channel.id}>`);
      });
    });
    loggerService.log(`Embed Message sent to channel with id ${channelId}`);
  }

  async buildEmbedFromCapturedMessages(
    loggerService: LoggerService,
    job_questions: string[],
    capturedMessages: string[],
    guildId: string,
    user: User
  ): Promise<EmbedMessage> {
    const guild = await this.client.guilds.fetch(guildId);
    const author = (await guild.members.fetch(user.id)).user;
    if (guild === null) {
      throw new Error(`Guild with id ${guildId} not found!`);
    }

    loggerService.log(`Embed Message built`);

    return {
      color: 0x0099ff,
      title: capturedMessages[0],
      author: {
        name: `${author.username}#${author.discriminator}`,
        iconURL: author.displayAvatarURL(),
      },
      description: capturedMessages[7],
      fields: [
        {
          name: job_questions[0],
          value: capturedMessages[0],
        },
        {
          name: job_questions[1],
          value: capturedMessages[1],
        },
        {
          name: job_questions[2],
          value: capturedMessages[2],
        },
        {
          name: job_questions[3],
          value: capturedMessages[3],
        },
        {
          name: job_questions[4],
          value: capturedMessages[4],
        },
        {
          name: job_questions[5],
          value: capturedMessages[5],
        },
        {
          name: job_questions[6],
          value: capturedMessages[6],
        },
        {
          name: "Contacte",
          value: `<@${user.id}>`,
          inline: true,
        },
      ],
      timestamp: new Date(),
      footer: {
        text: guild.name,
        iconURL: guild.iconURL() || "",
      },
    };
  }

  async createPrivateChannel(loggerService: LoggerService, guildId: string, user: User): Promise<Channel> {
    const guild = await this.client.guilds.fetch(guildId);

    if (guild === null) {
      throw new Error(`Guild with id ${guildId} not found!`);
    }

    const channel = await guild.channels.create(uuidv4(), {
      type: ChannelTypes.GUILD_TEXT,
      permissionOverwrites: [
        {
          id: user.id,
          allow: ["VIEW_CHANNEL", "SEND_MESSAGES"],
        },
        {
          id: guild.roles.everyone.id,
          deny: ["VIEW_CHANNEL"],
        },
      ],
    });
    loggerService.log(`Private channel created with id ${channel.id}`);
    return { id: channel.id };
  }

  async deleteChannel(loggerService: LoggerService, channel: Channel): Promise<void> {
    const discordChannel = await this.client.channels.fetch(channel.id);

    if (discordChannel === null) {
      throw new Error(`Channel with id ${channel.id} not found!`);
    }

    discordChannel.delete();
    loggerService.log(`Channel with id ${channel.id} deleted`);
  }

  async readMessagesFromChannel(
    loggerService: LoggerService,
    channel: Channel,
    guildId: string,
    user: User,
    job_questions: string[]
  ): Promise<string[]> {
    const channelMessage = await this.client.channels.fetch(channel.id);
    const guild = await this.client.guilds.fetch(guildId);
    const author = (await guild.members.fetch(user.id)).user;
    let counter = 0;
    // Array de respostas
    const answers: string[] = [];

    if (channelMessage === null) {
      throw new Error(`Channel with id ${channel.id} not found!`);
    }

    if (!channelMessage.isText()) {
      throw new Error(`Channel with id ${channel.id} is not a text channel!`);
    }

    if (guild === null) {
      throw new Error(`Guild with id ${guildId} not found!`);
    }
    // Mensagem inicial do canal privado
    channelMessage.send(`${author.toString()}, Por favor responda as perguntas abaixo para criar um novo anúncio.`);

    // Inicializar colector de respostas
    const collector: MessageCollector = channelMessage.createMessageCollector({
      time: 1000 * 300, // Esperar 5 minutos pelas respostas
    });

    // Enviar Questões
    channelMessage.send(job_questions[counter]);

    // Captar as questões
    collector.on("collect", (m: Message) => {
      if (m.author.id === author.id) {
        // Guardar as respostas em um array
        answers.push(m.content);
        // eslint-disable-next-line no-plusplus
        counter++;
        // Parar de recolher informação caso o utilizador tenha respondido a todas as perguntas.
        if (counter === Object.keys(job_questions).length) {
          collector.stop();
          loggerService.log("JOBS COMMAND - Collector stopped");
          return;
        }
        m.channel.send(job_questions[counter]).catch((err: Error) => {});
      }
    });

    return new Promise((resolve) => {
      // Após captar as questões
      collector.on("end", async (collected: Collection<string, Message<boolean>>) => {
        // Cancelar o job caso o user não tenha respondido a todas as perguntas.
        if (collected.size <= Object.keys(job_questions).length - 1) {
          channelMessage.delete();
          loggerService.log("JOBS COMMAND - Collector canceled");
        } else {
          resolve(answers);
          loggerService.log("JOBS COMMAND - Collector collected all answers");
        }
      });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deleteMessageFromChannel(loggerService: LoggerService, messageId: string, channelId: string): Promise<void> {
    // TODO
  }
}
