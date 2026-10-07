import { createTransport } from "nodemailer";

export type SendMail = (mail: { to: string; subject: string; text: string }) => Promise<unknown>;

export function smtpMailer(url: string, from: string): SendMail {
  const transport = createTransport(url);
  return (mail) => transport.sendMail({ from, ...mail });
}
