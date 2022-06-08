from datetime import date, datetime


class OrganizeFolders:

    def __init__(self) -> None:

        self.files_inf = {}

    
    def extensions_modify(self, ext) -> None:        

        self.files_inf[ext] = []
        

    def read_file_path(self, file_path):

        from os import walk

        from os.path import splitext, getmtime, getctime, join

        # splitext = get extension 
        # getctime = creation date
        # getmtime = last modified         

        from time import ctime, strftime
        

        for root, dirs, files in walk(file_path):

            for file in files:

                extension = splitext(file)[1]
                creation_date = ctime(getctime(join(root, file)))
                last_modify_date = ctime(getmtime(join(root, file)))                

                try:

                    self.files_inf[extension].append({
                    'root':root, 
                    'file':file, 
                    'creation_date':creation_date,
                    'last_modify_date':last_modify_date                
                    })

                except:                    

                    self.extensions_modify(extension)
                    self.files_inf[extension].append({
                    'root':root, 
                    'file':file, 
                    'creation_date':creation_date,
                    'last_modify_date':last_modify_date                
                    })
                    

                    
    
    
    
                



app = OrganizeFolders()

app.read_file_path(r'C:\Users\rol\Downloads\ARQUIVOS DO TIPO - .docx')
print(app.files_inf)



