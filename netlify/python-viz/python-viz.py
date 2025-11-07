import json
import matplotlib
matplotlib.use('Agg')  # Non-GUI backend
import matplotlib.pyplot as plt
import pandas as pd
import io
import base64
import sys

def handler(event, context):
    """
    Netlify Python function to generate matplotlib charts
    """
    try:
        # Parse request
        body = json.loads(event.get('body', '{}'))
        python_code = body.get('code', '')
        
        if not python_code:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'No code provided'})
            }
        
        # Create namespace for code execution
        namespace = {
            'plt': plt,
            'pd': pd,
            'io': io,
            'base64': base64,
            'sys': sys
        }
        
        # Execute the Python code
        exec(python_code, namespace)
        
        # Get the current figure and convert to base64
        fig = plt.gcf()
        buf = io.BytesIO()
        fig.savefig(buf, format='png', dpi=150, bbox_inches='tight', facecolor='white')
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close(fig)
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'image': img_base64
            })
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'type': type(e).__name__
            })
        }
