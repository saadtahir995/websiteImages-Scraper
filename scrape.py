import requests
from bs4 import BeautifulSoup
import os
import re

def download_images(url, output_dir="images"):
    """
    Downloads all images from a given website URL.

    Args:
        url: The URL of the website to scrape.
        output_dir: The directory to save the downloaded images.
    """

    # Create the output directory if it doesn't exist
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # Send a GET request to the URL
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()  # Raise an exception for bad status codes
    except requests.exceptions.RequestException as e:
        print(f"Error fetching URL: {e}")
        return

    # Parse the HTML content with Beautiful Soup
    soup = BeautifulSoup(response.text, "html.parser")

    # Find all image tags
    img_tags = soup.find_all("img")

    # Extract image URLs
    image_urls = []
    for tag in img_tags:
        src = tag.get("src")
        if src:
            if not src.startswith(("http://", "https://")):
                # Make sure the URL is absolute
                if url.endswith("/"):
                    src = url + src
                else:
                    src = url + "/" + src
            image_urls.append(src)

    # Download the images
    for i, img_url in enumerate(image_urls):
        try:
            img_response = requests.get(img_url, timeout=10, stream=True)
            img_response.raise_for_status()

            # Extract the filename from the URL
            filename = os.path.basename(img_url)
            if not filename:  # If filename is empty, use a default name
                filename = f"image_{i+1}.jpg"
            else:
                # Remove query parameters from filename
                filename = re.sub(r'\?.*', '', filename)

            # Save the image to the output directory
            filepath = os.path.join(output_dir, filename)
            with open(filepath, "wb") as f:
                for chunk in img_response.iter_content(chunk_size=8192):
                    f.write(chunk)

            print(f"Downloaded {filename}")
        except requests.exceptions.RequestException as e:
            print(f"Error downloading image {img_url}: {e}")

if __name__ == "__main__":
    website_url = input("Enter the website URL: ")
    download_images(website_url)