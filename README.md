# [Vinyl](https://vinyl-web.com)

> Ad-free, open-source YouTube downloading website using [ytdl-core](https://github.com/fent/node-ytdl-core) & [FFmpeg](https://ffmpeg.org/)
>
> Website Link: [https://vinyl-web.com](https://vinyl-web.com)

![Vinyl Screenshot](https://user-images.githubusercontent.com/45542237/82764648-31edaf00-9dc5-11ea-9a98-efdec5b71b9d.png)

### How does it work?

+ Backend deals with streaming data
  + Uses a rapid downloader
    + Splits data into chunks and sends multiple requests before combining chunks together
    + Fallback to streaming data
+ Frontend deals with converting data into usable formats
  + [FFmpegJS](https://github.com/Kagami/ffmpeg.js/) pre-compiled with support for vp9
  + Limit of 5 videos at one time
  + **Vercel Exclusive**: Uses a hive network to outsource download
+ Data transfer is locked when asking for a download
  + Uses aes-256-cbc encryption

### Why did I make this?

+ Provides a low-cpu-intensive backend environment as the heavy duty tasks are done client side
+ A quick way to just find videos and download them from YouTube

### How can you help out?

+ Simply make a fork of this repository and deploy it on your own server!
  + Currently, local Vercel deployments are not supported
+ Make sure to set the `URL` environment variable!

### Environment Variables

> Uses .env to store environment variables

`URL`: [**REQUIRED**] url of the webpage; used to check against referer header. If **not set**, uses `http://localhost:<Your current port settings>/`;

`PORT`: (defaults to 8080) port to host webpage

`KEY`: (defaults to random 16 characters) a 16 character key to encrypt messages

`IV`: (defaults to random 16 characters) a 16 character IV to encrypt messages

`SALT`: (defaults to random 4 characters) a 4 character salt used to encrypt messages

`BYTE_LIMIT`: (defaults to Infinity) a set number of bytes used to restrict download sizes

`TIME_LIMIT`: (defaults to Infinity) a set time (in seconds) used to restrict downloads

`QUEUE_LIMIT`: (defaults to 5) a set number of items that can be queued at once on site

`RAPID_FORKS`: (defaults to 1) the number of splits the rapid downloader should make to download a video. **Note**: a higher value will result in higher memory usage, but will result in a faster download time.

`HIVE_QUEEN`: [**[Current Website Only](https://vinyl-web.com)**] A reference to the **hive queen** link. Part of the hive network (exclusive to Vercel deployment)

### Hive Network [DEPRECATED]

> Developed to supercharge Vinyl on Vercel.

To download a video, a request is sent to the "hive queen" which returns 34 possible URLs to the "hive workers". Vinyl uses these workers to download chunks of a video and then merge the incoming data.

#### Hive Queen

+ Returns all possible workers back to the user

#### Hive Worker
+ Receives a payload and returns a chunk of downloaded information