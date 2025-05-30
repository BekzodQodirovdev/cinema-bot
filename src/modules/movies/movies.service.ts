import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Movie } from './schemas/movie.schema';
import { MovieDownload } from './schemas/movie-download.schema';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MoviesService {
  constructor(
    @InjectModel('Movie') private movieModel: Model<Movie>,
    @InjectModel('MovieDownload') private movieDownloadModel: Model<MovieDownload>
  ) {}

  async createMovie(movieData: {
    code: string;
    title: string;
    description: string;
    fileId: string;
    filePath: string;
  }): Promise<Movie> {
    const movie = new this.movieModel({
      ...movieData,
      downloadCount: 0,
      createdAt: new Date(),
    });
    return movie.save();
  }

  async getMovieByCode(code: string): Promise<Movie | null> {
    return this.movieModel.findOne({ 
      code: code.toLowerCase(),
      isActive: true 
    }).exec();
  }

  async deleteMovie(code: string): Promise<boolean> {
    const movie = await this.getMovieByCode(code);
    if (!movie) return false;

    // Delete file if exists
    if (movie.filePath) {
      try {
        await fs.promises.unlink(movie.filePath);
      } catch (error) {
        console.error(`Error deleting file: ${error}`);
      }
    }

    await this.movieModel.deleteOne({ code });
    return true;
  }

  async incrementDownloadCount(code: string, userId: number): Promise<void> {
    // Check if user has already downloaded this movie
    const existingDownload = await this.movieDownloadModel.findOne({
      userId,
      movieCode: code
    });

    if (!existingDownload) {
      // Create new download record
      await this.movieDownloadModel.create({
        userId,
        movieCode: code,
        downloadedAt: new Date()
      });

      // Increment download count only for unique downloads
      await this.movieModel.updateOne(
        { code },
        { $inc: { downloadCount: 1 } }
      );
    }
  }

  async getAllMovies(): Promise<Movie[]> {
    return this.movieModel.find().sort({ createdAt: -1 }).exec();
  }

  async searchMovies(query: string): Promise<Movie[]> {
    return this.movieModel.find({
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { code: { $regex: query, $options: 'i' } }
      ]
    }).limit(10);
  }

  async getMoviesCount(): Promise<number> {
    return this.movieModel.countDocuments();
  }

  async saveVideoFile(fileBuffer: Buffer, filename: string): Promise<string> {
    const uploadDir = path.join(process.cwd(), 'uploads');
    
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      await fs.promises.mkdir(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, filename);
    await fs.promises.writeFile(filePath, fileBuffer);
    return filePath;
  }

  async getMovieDownloads(code: string): Promise<number> {
    return this.movieDownloadModel.countDocuments({ movieCode: code });
  }
}