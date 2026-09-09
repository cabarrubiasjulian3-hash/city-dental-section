import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendRecoveryCodeEmail(toEmail, code) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error("[mailer] GMAIL_USER / GMAIL_APP_PASSWORD are not set in backend/.env");
    throw new Error("Email service is not configured.");
  }

  await transporter.sendMail({
    from: `"City Dental Section" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: "Your City Dental Section recovery code",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #3d5335;">Password recovery</h2>
        <p>We received a request to reset the password for your City Dental Section account.</p>
        <p>Your recovery code is:</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; color: #3d5335;">
          ${code}
        </p>
        <p>This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}