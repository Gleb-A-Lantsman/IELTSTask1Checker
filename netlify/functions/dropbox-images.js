const https = require('https');

exports.handler = async function(event, context) {
  // Enable CORS
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
  
  // Handle preflight OPTIONS request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers
    };
  }

  try {
    const category = event.queryStringParameters?.category;
    
    if (!category) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: true, 
          message: 'Category parameter is required' 
        })
      };
    }

    const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
    
    if (!DROPBOX_ACCESS_TOKEN) {
      console.error('DROPBOX_ACCESS_TOKEN not set');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: true, 
          message: 'Dropbox not configured. Please add DROPBOX_ACCESS_TOKEN to environment variables.' 
        })
      };
    }

    // Map category to Dropbox folder path
    const folderPaths = {
      'table': '/table',
      'line-graph': '/line-graph',
      'bar-chart': '/bar-chart',
      'pie-chart': '/pie-chart',
      'flowchart': '/flowchart',
      'maps': '/maps'
    };

    const folderPath = folderPaths[category];
    
    if (!folderPath) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: true, 
          message: `Invalid category: ${category}. Valid options: ${Object.keys(folderPaths).join(', ')}` 
        })
      };
    }

    console.log(`Attempting to list files in: ${folderPath}`);

    // List files in Dropbox folder
    let listResponse;
    try {
      listResponse = await dropboxApiRequest(
        'https://api.dropboxapi.com/2/files/list_folder',
        DROPBOX_ACCESS_TOKEN,
        {
          path: folderPath,
          limit: 100
        }
      );
    } catch (error) {
      console.error(`Error listing folder ${folderPath}:`, error.message);
      
      if (error.message.includes('path/not_found') || error.message.includes('not_found')) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ 
            error: true, 
            message: `Folder "${folderPath}" not found in Dropbox. Please create it in your Dropbox root.`,
            folderPath: folderPath
          })
        };
      }
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: true, 
          message: `Failed to access Dropbox folder: ${error.message}` 
        })
      };
    }

    // Filter for image files only
    const imageFiles = listResponse.entries.filter(entry => {
      const name = entry.name.toLowerCase();
      return entry['.tag'] === 'file' && 
             (name.endsWith('.jpg') || name.endsWith('.jpeg') || 
              name.endsWith('.png') || name.endsWith('.gif'));
    });

    console.log(`Found ${imageFiles.length} image file(s) in ${folderPath}`);

    if (imageFiles.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          category,
          images: [],
          count: 0,
          message: `No images found in ${folderPath}. Please upload .jpg, .png, or .gif files.`
        })
      };
    }

    // Get shared links for each image
    const images = [];
    
    for (const file of imageFiles) {
      try {
        let url;
        
        // Try to get existing shared link first
        try {
          const sharedLinkResponse = await dropboxApiRequest(
            'https://api.dropboxapi.com/2/sharing/list_shared_links',
            DROPBOX_ACCESS_TOKEN,
            {
              path: file.path_lower,
              direct_only: true
            }
          );

          if (sharedLinkResponse.links && sharedLinkResponse.links.length > 0) {
            // Use existing shared link
            url = sharedLinkResponse.links[0].url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
            console.log(`Using existing link for ${file.name}`);
          }
        } catch (linkError) {
          // No existing link, will create one
          console.log(`No existing link for ${file.name}, creating new one`);
        }

        // If no existing link, create one
        if (!url) {
          try {
            const createLinkResponse = await dropboxApiRequest(
              'https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings',
              DROPBOX_ACCESS_TOKEN,
              {
                path: file.path_lower,
                settings: {
                  requested_visibility: 'public'
                }
              }
            );
            url = createLinkResponse.url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
            console.log(`Created new link for ${file.name}`);
          } catch (createError) {
            // If link already exists, try to get it again
            if (createError.message.includes('shared_link_already_exists')) {
              const sharedLinkResponse = await dropboxApiRequest(
                'https://api.dropboxapi.com/2/sharing/list_shared_links',
                DROPBOX_ACCESS_TOKEN,
                {
                  path: file.path_lower,
                  direct_only: false
                }
              );
              if (sharedLinkResponse.links && sharedLinkResponse.links.length > 0) {
                url = sharedLinkResponse.links[0].url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
              }
            } else {
              throw createError;
            }
          }
        }

        if (url) {
          images.push({
            name: file.name,
            url: url,
            path: file.path_lower
          });
        }
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error.message);
        // Continue with other files even if one fails
      }
    }

    if (images.length === 0 && imageFiles.length > 0) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: true, 
          message: 'Found images but failed to create shared links. Check Dropbox token permissions (sharing.write and sharing.read required).' 
        })
      };
    }

    console.log(`Successfully processed ${images.length} image(s)`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        category,
        images,
        count: images.length
      })
    };

  } catch (error) {
    console.error('Unexpected error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: true, 
        message: `Server error: ${error.message}. Check function logs for details.`
      })
    };
  }
};

// Helper function to make Dropbox API requests
function dropboxApiRequest(url, token, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(url, options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsedData);
          } else {
            const errorMsg = parsedData.error_summary || parsedData.error?.message || `HTTP ${res.statusCode}`;
            reject(new Error(errorMsg));
          }
        } catch (error) {
          reject(new Error(`Failed to parse Dropbox response: ${responseData.substring(0, 100)}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}
