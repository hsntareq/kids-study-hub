from PIL import Image

def make_transparent():
    img = Image.open('public/logo.png')
    img = img.convert("RGBA")
    datas = img.getdata()

    newData = []
    # A simple threshold to remove dark background
    for item in datas:
        # Assuming background is dark (R, G, B are all low)
        if item[0] < 50 and item[1] < 50 and item[2] < 60:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)

    img.putdata(newData)
    img.save("public/logo.png", "PNG")
    img.save("src/app/icon.png", "PNG")

try:
    make_transparent()
    print("Success")
except Exception as e:
    print(f"Error: {e}")
