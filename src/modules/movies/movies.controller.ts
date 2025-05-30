import { Controller, Get, Post, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { MoviesService } from './movies.service';
import { RoleGuard } from '../auth/guards/role.guard';
import { UserRole } from '../../common/enums/user-role.enum';

@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService) {}

  @Post()
  @UseGuards(new RoleGuard([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
  async addMovie(@Body() movieData: {
    code: string;
    title: string;
    description: string;
    fileId: string;
    filePath: string;
  }) {
    const movie = await this.moviesService.createMovie({
      ...movieData,
      code: movieData.code.toLowerCase()
    });
    return { message: 'Movie added successfully', movie };
  }

  @Get()
  async getAllMovies() {
    const movies = await this.moviesService.getAllMovies();
    return { movies };
  }

  @Get('search')
  async searchMovies(@Query('q') query: string) {
    const movies = await this.moviesService.searchMovies(query);
    return { movies };
  }

  @Get('count')
  async getMoviesCount() {
    const count = await this.moviesService.getMoviesCount();
    return { count };
  }

  @Get(':code')
  async getMovieByCode(@Param('code') code: string) {
    const movie = await this.moviesService.getMovieByCode(code.toLowerCase());
    return { movie };
  }

  @Delete(':code')
  @UseGuards(new RoleGuard([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
  async deleteMovie(@Param('code') code: string) {
    const success = await this.moviesService.deleteMovie(code.toLowerCase());
    return { 
      message: success ? 'Movie deleted successfully' : 'Movie not found',
      success 
    };
  }
}