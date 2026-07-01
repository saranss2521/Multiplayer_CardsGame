# Use official Node.js runtime as a parent image
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if exists) from server directory
COPY server/package*.json ./server/

# Install production dependencies
RUN cd server && npm install --only=production

# Copy the rest of the server files
COPY server/ ./server/

# Set working directory to the server folder where server.js resides
WORKDIR /app/server

# Expose the default port Hugging Face Spaces uses (7860)
EXPOSE 7860

# Set environment variables
ENV PORT=7860
ENV NODE_ENV=production

# Start the application
CMD ["node", "server.js"]
