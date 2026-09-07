import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: { email?: string; password?: string; name?: string }) {
    if (!body?.email || !body?.password) {
      throw new BadRequestException('Email and password are required');
    }
    return this.authService.register(body.email, body.password, body.name || '');
  }

  @Post('login')
  async login(@Body() body: { email?: string; password?: string }) {
    if (!body?.email || !body?.password) {
      throw new BadRequestException('Email and password are required');
    }
    return this.authService.login(body.email, body.password);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: any) {
    const userId = req.user?.id;
    const user = await this.authService.getMe(userId);
    return { user };
  }
}
