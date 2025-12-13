import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;

export async function POST(request: NextRequest) {
    try {
        // Validate environment variables
        if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !NOTIFY_EMAIL) {
            console.warn('Email notification skipped: Missing email configuration');
            return NextResponse.json({
                success: false,
                message: 'Email configuration not set up'
            });
        }

        const body = await request.json();
        const { type, proposalId, clientName, proposalTitle, agencyEmail, signedAt } = body;

        if (type !== 'proposal-signed') {
            return NextResponse.json({
                error: 'Invalid notification type'
            }, { status: 400 });
        }

        // Create transporter with Gmail SMTP
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: GMAIL_USER,
                pass: GMAIL_APP_PASSWORD,
            },
        });

        // Format the signed date
        const signedDate = signedAt
            ? new Date(signedAt).toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short'
            })
            : 'Just now';

        // Get the proposal URL
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://activeset-internal-tool.up.railway.app';
        const proposalUrl = `${baseUrl}/view/${proposalId}`;

        // Email content
        const emailHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Proposal Signed!</h1>
                </div>
                
                <div style="background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none;">
                    <p style="font-size: 16px; color: #334155; margin-bottom: 20px;">
                        Great news! <strong>${clientName}</strong> has signed and approved your proposal.
                    </p>
                    
                    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Proposal:</td>
                                <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600;">${proposalTitle}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Client:</td>
                                <td style="padding: 8px 0; color: #1e293b; font-size: 14px; font-weight: 600;">${clientName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Signed At:</td>
                                <td style="padding: 8px 0; color: #1e293b; font-size: 14px;">${signedDate}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <a href="${proposalUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
                        View Signed Proposal →
                    </a>
                </div>
                
                <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px;">
                    <p>This is an automated notification from ActiveSet Proposal Generator.</p>
                </div>
            </div>
        `;

        // Send the email
        await transporter.sendMail({
            from: `"ActiveSet Proposals" <${GMAIL_USER}>`,
            to: agencyEmail || NOTIFY_EMAIL,
            subject: `✅ Proposal Signed: ${proposalTitle} - ${clientName}`,
            html: emailHtml,
        });

        console.log(`Email notification sent for proposal ${proposalId}`);

        return NextResponse.json({
            success: true,
            message: 'Notification sent successfully'
        });

    } catch (error) {
        console.error('Error sending notification:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to send notification'
        }, { status: 500 });
    }
}
