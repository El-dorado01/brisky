import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ConnectorsService } from './connectors.service';
import { AuthGuard } from '../auth/auth.guard';
import { ConfigService } from '@nestjs/config';

@Controller('connectors')
export class ConnectorsController {
  private readonly logger = new Logger(ConnectorsController.name);

  constructor(
    private readonly connectorsService: ConnectorsService,
    private readonly configService: ConfigService,
  ) {}

  @Get('google-drive/auth-url')
  @UseGuards(AuthGuard)
  getGoogleAuthUrl(@Req() req: any) {
    const userId = req.user?.id;
    const url = this.connectorsService.getGoogleAuthUrl(userId);
    return { url };
  }

  @Get('google-drive/callback')
  async handleGoogleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: FastifyReply,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:5173');

    const sendRedirect = (targetUrl: string, title = 'Redirecting...') => {
      return res
        .status(302)
        .header('Location', targetUrl)
        .header('Content-Type', 'text/html; charset=utf-8')
        .send(`
<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="refresh" content="0;url=${targetUrl}">
    <title>${title}</title>
  </head>
  <body style="background:#0f172a;color:#94a3b8;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <div style="text-align:center;padding:24px;border-radius:12px;background:#1e293b;border:1px solid #334155;max-width:420px;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
      <h3 style="color:#f8fafc;margin-top:0;font-size:18px;">Google Drive Connected</h3>
      <p style="font-size:14px;line-height:1.5;">Redirecting you back to Brisky...</p>
      <p style="margin-top:16px;"><a href="${targetUrl}" style="color:#818cf8;text-decoration:none;font-weight:500;font-size:13px;">Click here if you are not redirected automatically &rarr;</a></p>
    </div>
    <script>window.location.replace(${JSON.stringify(targetUrl)});</script>
  </body>
</html>
        `);
    };

    if (error) {
      this.logger.warn(`Google OAuth denied: ${error}`);
      return sendRedirect(`${frontendUrl}?error=${encodeURIComponent(error)}`, 'Google Auth Error');
    }

    if (!code) {
      throw new BadRequestException('Authorization code missing');
    }

    try {
      const result = await this.connectorsService.handleGoogleCallback(code, state);
      this.logger.log(`Google Drive linked successfully: ${result.email}`);
      return sendRedirect(
        `${frontendUrl}?connected=google_drive&email=${encodeURIComponent(result.email)}`,
        'Google Drive Linked Successfully',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to handle Google callback: ${msg}`);
      return sendRedirect(`${frontendUrl}?error=${encodeURIComponent(msg)}`, 'Connection Error');
    }
  }

  @Get()
  @UseGuards(AuthGuard)
  async listAccounts(@Req() req: any) {
    const userId = req.user?.id;
    const accounts = await this.connectorsService.listAccounts(userId);
    const pollingEnabled =
      process.env.IS_WORKER !== 'true' &&
      this.configService.get<string>('ENABLE_CONNECTOR_POLLING', 'true') !== 'false';
    const pollIntervalSec =
      Number(this.configService.get('CONNECTOR_POLL_INTERVAL_SEC', 120)) || 120;
    return {
      count: accounts.length,
      accounts,
      pollingEnabled,
      pollIntervalSec,
    };
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  async deleteAccount(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id;
    try {
      await this.connectorsService.deleteAccount(id, userId);
      return { success: true, message: 'Connected account removed' };
    } catch (err: any) {
      const msg = err?.message || 'Failed to disconnect account';
      this.logger.error(`Error deleting connector account ${id}: ${msg}`);
      throw new BadRequestException(msg);
    }
  }

  @Get(':id/folders')
  @UseGuards(AuthGuard)
  async listFolders(
    @Param('id') id: string,
    @Query('parentFolderId') parentFolderId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id;
    try {
      const folders = await this.connectorsService.listFolders(id, userId, parentFolderId || 'root');
      return { count: folders.length, folders };
    } catch (err: any) {
      const msg = err?.message || 'Failed to list folders from provider';
      this.logger.error(`Error listing folders for connector account ${id}: ${msg}`);
      throw new BadRequestException(msg);
    }
  }

  @Post(':id/select-folders')
  @UseGuards(AuthGuard)
  async setSelectedFolders(
    @Param('id') id: string,
    @Body() body: { folders: Array<{ id: string; name: string }> },
    @Req() req: any,
  ) {
    const userId = req.user?.id;
    if (!Array.isArray(body?.folders)) {
      throw new BadRequestException('folders array required');
    }
    await this.connectorsService.setSelectedFolders(id, userId, body.folders);
    return { success: true, count: body.folders.length };
  }

  @Post(':id/sync')
  @UseGuards(AuthGuard)
  async syncAccount(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id;
    try {
      const summary = await this.connectorsService.syncAccount(id, userId);
      return { success: true, ...summary };
    } catch (err: any) {
      const msg = err?.message || 'Failed to sync connector account';
      this.logger.error(`Error syncing connector account ${id}: ${msg}`);
      throw new BadRequestException(msg);
    }
  }

  @Post(':id/sync-changes')
  @UseGuards(AuthGuard)
  async syncAccountChanges(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id;
    try {
      const summary = await this.connectorsService.syncAccountChanges(id, userId);
      return { success: true, ...summary };
    } catch (err: any) {
      const msg = err?.message || 'Failed to incrementally sync connector account';
      this.logger.error(`Error incrementally syncing connector account ${id}: ${msg}`);
      throw new BadRequestException(msg);
    }
  }
}
