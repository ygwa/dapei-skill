import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';

@Controller('api/v1/users')
export class UserController {
  @Get(':id')
  getUser(@Param('id') id: string) {
    return { id };
  }

  @Post()
  createUser(@Body() dto: any) {
    return dto;
  }

  @Put(':id')
  updateUser(@Param('id') id: string, @Body() dto: any) {
    return { id, ...dto };
  }

  @Delete(':id')
  deleteUser(@Param('id') id: string) {
    return { id };
  }
}
